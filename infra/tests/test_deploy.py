"""Exercise release switching and rollback without accessing Docker or the VPS."""
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
        self.previous = self.base / "releases" / ("b" * 40)
        self.release = self.base / "releases" / self.sha
        self.previous.mkdir(parents=True)
        (self.release / "infra").mkdir(parents=True)
        (self.release / ".build-complete").touch()
        (self.release / "infra/compose.yaml").write_text("candidate compose\n")
        (self.base / "compose.yaml").write_text("previous compose\n")
        (self.base / ".env").write_text(f"SPHEREX_RELEASE_DIR={self.base}/current\n")
        (self.base / "current").symlink_to(self.previous)
        (self.base / "repository.git").mkdir()
        binary = self.base / "bin"
        binary.mkdir()
        self.env = {**os.environ, "PATH": f"{binary}:{os.environ['PATH']}", "TEST_BASE": str(self.base)}
        self.env.pop("SPHEREX_ALLOW_ROLLBACK", None)
        self.add_binary(binary, "flock", "#!/bin/sh\nexit 0\n")
        self.add_binary(binary, "chown", "#!/bin/sh\nexit 0\n")
        self.add_binary(binary, "git", "#!/bin/sh\ncase \"$*\" in *rev-parse*) printf '%s\\n' " + self.sha + ";; esac\n")
        self.add_binary(binary, "docker", '''#!/usr/bin/env python3
import os
from pathlib import Path
import sys
b = Path(os.environ["TEST_BASE"])
args = sys.argv[1:]
with (b / "docker.log").open("a") as log:
    log.write(" ".join(args) + "\\n")
if "up" in args and os.environ.get("FAIL_CANDIDATE") == "1" and (b / "current").resolve().name == "a" * 40:
    sys.exit(42)
if "ps" in args:
    print("test-container")
if args and args[0] == "inspect":
    print("healthy")
''')
        original = (Path(__file__).parents[1] / "deploy.sh").read_text()
        # Substitute only the fixed host path and the root precondition.
        original = original.replace("base=/opt/docker/spherex", f"base={self.base}")
        original = original.replace("[[ $EUID == 0 ]]", "[[ 1 == 1 ]]")
        self.script = self.base / "deploy.sh"
        self.script.write_text(original)

    @staticmethod
    def add_binary(directory, name, content):
        path = directory / name
        path.write_text(content)
        path.chmod(0o755)

    def run_deploy(self, sha=None):
        return subprocess.run(["bash", str(self.script), sha or self.sha], env=self.env,
                              text=True, capture_output=True, timeout=10)

    def test_success_switches_release_and_records_commit(self):
        result = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.base / "current").resolve(), self.release)
        self.assertEqual((self.base / "current-sha").read_text().strip(), self.sha)
        self.assertIn("--project-name spherex", (self.base / "docker.log").read_text())

    def test_failed_startup_restores_previous_release_and_compose(self):
        self.env["FAIL_CANDIDATE"] = "1"
        result = self.run_deploy()
        self.assertEqual(result.returncode, 42, result.stderr)
        self.assertEqual((self.base / "current").resolve(), self.previous)
        self.assertEqual((self.base / "compose.yaml").read_text(), "previous compose\n")
        self.assertIn("restoring the previous", result.stderr)

    def test_invalid_sha_is_rejected_before_docker(self):
        result = self.run_deploy("main; whoami")
        self.assertEqual(result.returncode, 2)
        self.assertFalse((self.base / "docker.log").exists())

    def test_real_git_fetch_keeps_the_main_reference(self):
        source = Path(__file__).resolve().parents[2]
        self.sha = subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
        candidate = self.release.with_name(self.sha)
        self.release.rename(candidate)
        self.release = candidate
        (self.base / "bin/git").unlink()
        (self.base / "repository.git").rmdir()
        seed = self.base / "seed.git"
        subprocess.run(["git", "init", "--bare", str(seed)], check=True, capture_output=True)
        subprocess.run(["git", "--git-dir=" + str(seed), "fetch", "--no-tags", str(source),
                        "HEAD:refs/heads/main"], check=True, capture_output=True)
        subprocess.run(["git", "--git-dir=" + str(seed), "symbolic-ref", "HEAD", "refs/heads/main"],
                       check=True, capture_output=True)
        text = self.script.read_text().replace(
            "repo=https://github.com/GutoValentim/sphereX-planetX-NASA.git",
            "repo=" + shlex.quote(str(seed)),
        )
        self.script.write_text(text)
        result = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        main = subprocess.check_output(["git", "--git-dir=" + str(self.base / "repository.git"),
                                        "rev-parse", "refs/heads/main"], text=True).strip()
        self.assertEqual(main, self.sha)


if __name__ == "__main__":
    unittest.main()
