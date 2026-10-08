---
name: difflab-init
description: Compatibility entrypoint for linking a repository to a Difflab Project; delegates setup and recovery to difflab-setup.
compatibility: Requires the difflab-setup skill and its CLI prerequisites.
---

# Initialize a Difflab Project

For repository initialization or missing/inconsistent setup, follow the [Difflab setup skill](../difflab-setup/SKILL.md). It owns project selection, CLI installation, client MCP registration, and setup recovery. Preserve the current request's scope: a repository-link request does not require reconfiguring a working client.

This entrypoint remains available for existing installations and MCP setup hints. Install `difflab-setup` alongside it; do not maintain a separate setup procedure here.
