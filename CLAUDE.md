# CLAUDE.md

Project instructions are in `AGENTS.md`, shared with other agents:

@AGENTS.md

## Claude Code specifics

- Before any change, run `git fetch`, inspect `main`, and check production `/healthz` endpoints: `curl https://api.spherex.prospectordigital.com.br/healthz` and `curl https://spherex.prospectordigital.com.br/healthz`.
- Work on a `claude/<topic>` branch; never push directly to `main`.
- Run the full `AGENTS.md` validation before opening a PR, and report anything that could not be verified, such as container tests.
- Commands contacting IRSA or generating sequences/spectra may take minutes; run them in the background.
