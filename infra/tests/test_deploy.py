"""Exercise scoped release switching and rollback without Docker or the VPS."""
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest


class DeployTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="spherex-deploy-test-")
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name).resolve()
        self.sha = "a" * 40
        self.previous_sha = "b" * 40
        self.legacy_release = self.base / "releases" / self.previous_sha
        self.previous_api = self.base / "releases" / "api" / self.previous_sha
        self.previous_frontend = self.base / "releases" / "frontend" / self.previous_sha
        self.api_release = self.base / "releases" / "api" / self.sha
        self.frontend_release = self.base / "releases" / "frontend" / self.sha
        self.previous_python = self.base / "releases" / "python" / self.previous_sha
        self.python_release = self.base / "releases" / "python" / self.sha
        self.previous_lab = self.base / "releases" / "lab" / self.previous_sha
        self.lab_release = self.base / "releases" / "lab" / self.sha
        for release in (
            self.legacy_release,
            self.previous_api,
            self.previous_frontend,
            self.previous_python,
            self.previous_lab,
        ):
            self.add_release(release, self.previous_sha)
        self.add_release(self.api_release, self.sha, compose="candidate compose\n")
        self.add_release(self.frontend_release, self.sha)
        self.add_release(self.python_release, self.sha)
        self.add_release(self.lab_release, self.sha)
        (self.base / "compose.yaml").write_text("previous compose\n")
        (self.base / ".env").write_text(
            f"SPHEREX_RELEASE_DIR={self.base}/current\n"
            "FRONTEND_DOMAIN=front.example\nAPI_DOMAIN=api.example\n"
        )
        (self.base / "current").symlink_to(self.legacy_release)
        (self.base / "repository.git").mkdir()

        binary = self.base / "bin"
        binary.mkdir()
        self.env = {
            **os.environ,
            "PATH": f"{binary}:{os.environ['PATH']}",
            "TEST_BASE": str(self.base),
            "TEST_SHA": self.sha,
        }
        self.env.pop("SPHEREX_ALLOW_ROLLBACK", None)
        self.add_binary(binary, "flock", "#!/bin/sh\nexit 0\n")
        self.add_binary(binary, "chown", "#!/bin/sh\nexit 0\n")
        self.add_binary(
            binary,
            "sudo",
            '#!/bin/sh\nprintf "%s\\n" "$@" > "$TEST_BASE/sudo.log"\n',
        )
        self.add_binary(
            binary,
            "git",
            "#!/bin/sh\n"
            "case \"$*\" in\n"
            "  *rev-parse*) printf '%s\\n' \"${LATEST_SHA:-$TEST_SHA}\";;\n"
            "  *'diff --no-renames'*) printf '%s\\n' \"$CHANGED_SINCE_TARGET\";;\n"
            "esac\n",
        )
        self.add_binary(
            binary,
            "docker",
            '''#!/usr/bin/env python3
import os
from pathlib import Path
import sys
b = Path(os.environ["TEST_BASE"])
args = sys.argv[1:]
with (b / "docker.log").open("a") as log:
    log.write(" ".join(args) + "\\n")
if "up" in args and os.environ.get("FAIL_CANDIDATE") == "1":
    candidate = os.environ["TEST_SHA"]
    services = [name for name in ("api", "frontend", "python", "lab") if name in args]
    for service in services:
        current = b / ("current-" + service)
        if current.exists() and current.resolve().name == candidate:
            sys.exit(42)
if (
    "exec" in args
    and "container-frontend" in args
    and os.environ.get("FAIL_FRONTEND_VERIFY") == "1"
):
    current = b / "current-frontend"
    if current.exists() and current.resolve().name == os.environ["TEST_SHA"]:
        sys.exit(43)
if "ps" in args:
    print("container-" + args[args.index("-q") + 1])
if args and args[0] == "inspect":
    print("healthy")
''',
        )
        original = (Path(__file__).parents[1] / "deploy.sh").read_text()
        original = original.replace("base=/opt/docker/spherex", f"base={self.base}")
        original = original.replace("[[ $EUID == 0 ]]", "[[ 1 == 1 ]]")
        self.script = self.base / "deploy.sh"
        self.script.write_text(original)

    @staticmethod
    def add_release(path, sha, compose=None):
        path.mkdir(parents=True)
        (path / ".release.env").write_text(f"GIT_SHA={sha}\n")
        (path / ".build-complete").touch()
        if compose is not None:
            (path / "infra").mkdir()
            (path / "infra" / "compose.yaml").write_text(compose)

    @staticmethod
    def add_binary(directory, name, content):
        path = directory / name
        path.write_text(content)
        path.chmod(0o755)

    def prepare_independent_layout(self, python=True, lab=True):
        (self.base / "current-api").symlink_to(self.previous_api)
        (self.base / "current-frontend").symlink_to(self.previous_frontend)
        env = (
            f"SPHEREX_API_RELEASE_DIR={self.base}/current-api\n"
            f"SPHEREX_FRONTEND_RELEASE_DIR={self.base}/current-frontend\n"
        )
        if python:
            (self.base / "current-python").symlink_to(self.previous_python)
            env += f"SPHEREX_PYTHON_RELEASE_DIR={self.base}/current-python\n"
        if lab:
            (self.base / "current-lab").symlink_to(self.previous_lab)
            env += f"SPHEREX_LAB_RELEASE_DIR={self.base}/current-lab\n"
        (self.base / ".env").write_text(env + "FRONTEND_DOMAIN=front.example\nAPI_DOMAIN=api.example\n")
        (self.base / "compose.yaml").write_text(
            "SPHEREX_API_RELEASE_DIR\nSPHEREX_FRONTEND_RELEASE_DIR\nSPHEREX_PYTHON_RELEASE_DIR\n"
            "SPHEREX_LAB_RELEASE_DIR\n"
        )

    def run_deploy(self, sha=None, scope="stack"):
        return subprocess.run(
            ["bash", str(self.script), sha or self.sha, scope],
            env=self.env,
            text=True,
            capture_output=True,
            timeout=10,
        )

    def test_stack_deploy_switches_all_releases_and_records_sha(self):
        result = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.base / "current-api").resolve(), self.api_release)
        self.assertEqual((self.base / "current-frontend").resolve(), self.frontend_release)
        self.assertEqual((self.base / "current-python").resolve(), self.python_release)
        self.assertEqual((self.base / "current-lab").resolve(), self.lab_release)
        for marker in ("api", "frontend", "python", "lab"):
            self.assertEqual((self.base / f"{marker}-current-sha").read_text().strip(), self.sha)
        self.assertEqual((self.base / "current-sha").read_text().strip(), self.sha)
        self.assertEqual((self.base / "compose.yaml").read_text(), "candidate compose\n")
        env = (self.base / ".env").read_text()
        self.assertIn("SPHEREX_API_RELEASE_DIR=", env)
        self.assertIn(f"SPHEREX_PYTHON_RELEASE_DIR={self.base}/current-python", env)
        self.assertIn(f"SPHEREX_LAB_RELEASE_DIR={self.base}/current-lab", env)
        self.assertIn("LAB_DOMAIN=lab.spherex.prospectordigital.com.br", env)
        log = (self.base / "docker.log").read_text()
        self.assertIn("up -d --force-recreate --wait --wait-timeout 120 api frontend python lab", log)
        self.assertIn("exec -e EXPECTED_GIT_SHA=" + self.sha + " -e HEALTH_URL=http://127.0.0.1:8000/healthz container-python", log)
        self.assertIn("HEALTH_URL=http://127.0.0.1:8765/api/health?light=1 container-lab", log)
        self.assertTrue((self.base / "cache").is_dir())
        self.assertTrue((self.base / "lab").is_dir())

    def test_python_deploy_leaves_node_services_unchanged(self):
        self.prepare_independent_layout()
        result = self.run_deploy(scope="python")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.base / "current-python").resolve(), self.python_release)
        self.assertEqual((self.base / "current-api").resolve(), self.previous_api)
        self.assertEqual((self.base / "current-frontend").resolve(), self.previous_frontend)
        self.assertEqual((self.base / "python-current-sha").read_text().strip(), self.sha)
        log = (self.base / "docker.log").read_text()
        self.assertIn("up -d --force-recreate --wait --wait-timeout 120 python", log)
        self.assertNotIn("wait-timeout 120 api", log)

    def test_python_deploy_requires_a_stack_with_python(self):
        self.prepare_independent_layout(python=False)
        result = self.run_deploy(scope="python")
        self.assertEqual(result.returncode, 2)
        self.assertIn("stack deployment is required", result.stderr)

    def test_python_deploy_is_skipped_only_by_later_python_changes(self):
        self.prepare_independent_layout()
        self.env["LATEST_SHA"] = "c" * 40
        self.env["CHANGED_SINCE_TARGET"] = "backend/app/api/server.ts\nfrontend/src/App.tsx"
        result = self.run_deploy(scope="python")
        self.assertIn("SPHEREx python deployed", result.stdout, result.stderr)

        self.env["CHANGED_SINCE_TARGET"] = "backend/app/services/irsa_client.py"
        result = self.run_deploy(scope="python")
        self.assertIn("Skipped superseded python commit", result.stdout)

    def test_lab_deploy_leaves_product_services_unchanged(self):
        self.prepare_independent_layout()
        result = self.run_deploy(scope="lab")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.base / "current-lab").resolve(), self.lab_release)
        self.assertEqual((self.base / "current-python").resolve(), self.previous_python)
        self.assertEqual((self.base / "current-api").resolve(), self.previous_api)
        log = (self.base / "docker.log").read_text()
        self.assertIn("up -d --force-recreate --wait --wait-timeout 120 lab", log)
        self.assertNotIn("wait-timeout 120 python", log)

    def test_lab_deploy_is_superseded_by_later_lab_or_backend_python_changes(self):
        self.prepare_independent_layout()
        self.env["LATEST_SHA"] = "c" * 40
        self.env["CHANGED_SINCE_TARGET"] = "frontend/src/App.tsx\nbackend/app/api/server.ts"
        result = self.run_deploy(scope="lab")
        self.assertIn("SPHEREx lab deployed", result.stdout, result.stderr)
        for changed in ("dev/temporal-lab/public/app.js", "backend/app/services/spectrum_service.py"):
            self.env["CHANGED_SINCE_TARGET"] = changed
            result = self.run_deploy(scope="lab")
            self.assertIn("Skipped superseded lab commit", result.stdout)

    def test_lab_release_reuses_the_python_build_of_the_same_commit(self):
        self.prepare_independent_layout()
        import shutil

        shutil.rmtree(self.lab_release)
        (self.python_release / ".venv").mkdir()
        (self.python_release / ".venv" / "marker").write_text("venv")
        self.add_binary(
            self.base / "bin", "git",
            "#!/bin/sh\ncase \"$*\" in\n  *rev-parse*) printf '%s\\n' \"$TEST_SHA\";;\n"
            "  *archive*) tar -cf - -C \"$TEST_BASE\" --files-from /dev/null;;\nesac\n",
        )
        result = self.run_deploy(scope="lab")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.lab_release / ".venv" / "marker").read_text(), "venv")
        self.assertEqual((self.lab_release / ".release.env").read_text(), f"GIT_SHA={self.sha}\n")
        self.assertNotIn("spherex-build-lab", (self.base / "docker.log").read_text())

    def test_api_deploy_is_allowed_after_python_only_changes(self):
        self.prepare_independent_layout()
        self.env["LATEST_SHA"] = "c" * 40
        self.env["CHANGED_SINCE_TARGET"] = "backend/requirements.txt\nbackend/app/main.py"
        result = self.run_deploy(scope="api")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("SPHEREx api deployed", result.stdout)

    def test_failed_first_python_stack_deploy_removes_python_and_restores_node(self):
        self.env["FAIL_CANDIDATE"] = "1"
        result = self.run_deploy()
        self.assertEqual(result.returncode, 42, result.stderr)
        self.assertFalse((self.base / "current-python").exists())
        log = (self.base / "docker.log").read_text().splitlines()
        self.assertTrue(any(line.endswith(" rm -sf python lab") for line in log), log)
        rollback_up = [line for line in log if "up -d" in line][-1]
        self.assertTrue(rollback_up.endswith("--wait-timeout 120 api frontend"), rollback_up)

    def test_api_deploy_leaves_frontend_release_unchanged(self):
        self.prepare_independent_layout()
        result = self.run_deploy(scope="api")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.base / "current-api").resolve(), self.api_release)
        self.assertEqual((self.base / "current-frontend").resolve(), self.previous_frontend)
        self.assertEqual((self.base / "api-current-sha").read_text().strip(), self.sha)
        self.assertFalse((self.base / "frontend-current-sha").exists())
        log = (self.base / "docker.log").read_text()
        self.assertIn("up -d --force-recreate --wait --wait-timeout 120 api", log)
        self.assertNotIn("up -d --force-recreate --wait --wait-timeout 120 frontend", log)

    def test_frontend_deploy_leaves_api_release_unchanged(self):
        self.prepare_independent_layout()
        result = self.run_deploy(scope="frontend")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.base / "current-api").resolve(), self.previous_api)
        self.assertEqual((self.base / "current-frontend").resolve(), self.frontend_release)
        log = (self.base / "docker.log").read_text()
        self.assertIn("up -d --force-recreate --wait --wait-timeout 120 frontend", log)
        self.assertNotIn("up -d --force-recreate --wait --wait-timeout 120 api", log)

    def test_api_deploy_is_allowed_after_unrelated_frontend_changes(self):
        self.prepare_independent_layout()
        self.env["LATEST_SHA"] = "c" * 40
        self.env["CHANGED_SINCE_TARGET"] = "frontend/src/App.tsx"
        result = self.run_deploy(scope="api")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("SPHEREx api deployed", result.stdout)
        self.assertEqual((self.base / "current-api").resolve(), self.api_release)

    def test_api_deploy_is_skipped_when_backend_changed_after_target(self):
        self.prepare_independent_layout()
        self.env["LATEST_SHA"] = "c" * 40
        self.env["CHANGED_SINCE_TARGET"] = "backend/app/api/server.ts"
        result = self.run_deploy(scope="api")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Skipped superseded api commit", result.stdout)
        self.assertEqual((self.base / "current-api").resolve(), self.previous_api)

    def test_failed_api_deploy_rolls_back_only_api(self):
        self.prepare_independent_layout()
        self.env["FAIL_CANDIDATE"] = "1"
        result = self.run_deploy(scope="api")
        self.assertEqual(result.returncode, 42, result.stderr)
        self.assertEqual((self.base / "current-api").resolve(), self.previous_api)
        self.assertEqual((self.base / "current-frontend").resolve(), self.previous_frontend)
        self.assertIn("restoring the previous", result.stderr)

    def test_failed_stack_deploy_restores_compose_and_both_releases(self):
        self.env["FAIL_CANDIDATE"] = "1"
        result = self.run_deploy()
        self.assertEqual(result.returncode, 42, result.stderr)
        self.assertEqual((self.base / "current-api").resolve(), self.legacy_release)
        self.assertEqual((self.base / "current-frontend").resolve(), self.legacy_release)
        self.assertFalse((self.base / "current-python").exists())
        self.assertEqual((self.base / "compose.yaml").read_text(), "previous compose\n")
        self.assertIn("SPHEREX_RELEASE_DIR", (self.base / ".env").read_text())
        self.assertIn("restoring the previous", result.stderr)

    def test_failed_stack_verification_preserves_release_sha_markers(self):
        for marker in ("api-current-sha", "frontend-current-sha", "current-sha"):
            (self.base / marker).write_text(self.previous_sha + "\n")
        self.env["FAIL_FRONTEND_VERIFY"] = "1"
        result = self.run_deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.base / "current-api").resolve(), self.legacy_release)
        self.assertEqual((self.base / "current-frontend").resolve(), self.legacy_release)
        for marker in ("api-current-sha", "frontend-current-sha", "current-sha"):
            self.assertEqual((self.base / marker).read_text().strip(), self.previous_sha)

    def test_invalid_sha_or_scope_is_rejected_before_docker(self):
        result = self.run_deploy("main; whoami")
        self.assertEqual(result.returncode, 2)
        invalid_scope = self.run_deploy(scope="other")
        self.assertEqual(invalid_scope.returncode, 2)
        self.assertFalse((self.base / "docker.log").exists())

    def test_ssh_wrapper_accepts_only_known_deploy_scopes(self):
        wrapper = Path(__file__).parents[1] / "ssh-deploy.sh"
        for scope in ("api", "frontend", "python", "lab", "stack"):
            self.env["SSH_ORIGINAL_COMMAND"] = f"deploy {self.sha} {scope}"
            result = subprocess.run(
                ["bash", str(wrapper)],
                env=self.env,
                text=True,
                capture_output=True,
                timeout=10,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(
                (self.base / "sudo.log").read_text().splitlines(),
                ["-n", "/usr/local/sbin/spherex-deploy", self.sha, scope],
            )

        (self.base / "sudo.log").unlink()
        self.env["SSH_ORIGINAL_COMMAND"] = f"deploy {self.sha} api; whoami"
        result = subprocess.run(
            ["bash", str(wrapper)],
            env=self.env,
            text=True,
            capture_output=True,
            timeout=10,
        )
        self.assertEqual(result.returncode, 1)
        self.assertFalse((self.base / "sudo.log").exists())

    def test_real_git_fetch_keeps_the_main_reference(self):
        (self.base / "bin" / "git").unlink()
        (self.base / "repository.git").rmdir()
        seed = self.base / "seed.git"
        subprocess.run(["git", "init", "--bare", str(seed)], check=True, capture_output=True)
        tree = subprocess.check_output(
            ["git", "--git-dir=" + str(seed), "mktree"], input="", text=True
        ).strip()
        self.sha = subprocess.check_output(
            ["git", "--git-dir=" + str(seed), "-c", "user.name=CI", "-c",
             "user.email=ci@example.invalid", "commit-tree", tree],
            input="Deployment fixture\n",
            text=True,
        ).strip()
        self.env["TEST_SHA"] = self.sha
        for attribute in ("api_release", "frontend_release", "python_release", "lab_release"):
            old_path = getattr(self, attribute)
            new_path = old_path.with_name(self.sha)
            old_path.rename(new_path)
            (new_path / ".release.env").write_text(f"GIT_SHA={self.sha}\n")
            setattr(self, attribute, new_path)
        subprocess.run(
            ["git", "--git-dir=" + str(seed), "update-ref", "refs/heads/main", self.sha],
            check=True,
        )
        subprocess.run(
            ["git", "--git-dir=" + str(seed), "symbolic-ref", "HEAD", "refs/heads/main"],
            check=True,
        )
        text = self.script.read_text().replace(
            "repo=https://github.com/GutoValentim/sphereX-planetX-NASA.git",
            "repo=" + shlex.quote(str(seed)),
        )
        self.script.write_text(text)
        result = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        main = subprocess.check_output(
            ["git", "--git-dir=" + str(self.base / "repository.git"),
             "rev-parse", "refs/heads/main"],
            text=True,
        ).strip()
        self.assertEqual(main, self.sha)


if __name__ == "__main__":
    unittest.main()
