# Building the Container Image Locally

This page documents how to build the Landing Zone Accelerator on AWS container image from source for **local development and testing**. If you are deploying the solution into an AWS account, use the public image from the [AWS Solutions Public ECR Gallery](https://gallery.ecr.aws/aws-solutions/landing-zone-accelerator-on-aws) instead — the local build described here is not suitable for running in Amazon ECS.

???+ warning "Platform support"
    `deployment/create-container.sh` is a Bash script that relies on POSIX tools (`sed`, `cd`, etc.) and is only supported on macOS and Linux. Windows users should run it from within [WSL](https://learn.microsoft.com/en-us/windows/wsl/install) or another POSIX-compatible environment.

## Running the script

The script must be run from the `source/` directory (it uses `cd ".."` to locate the repo root):

```bash
cd source
../deployment/create-container.sh
```

A successful run produces a local Docker image tagged `landing-zone-accelerator-on-aws:v<version>`, where the version is read from `source/package.json`. The image lives only in your local Docker daemon.

Inspect the resulting image:

```bash
docker images | grep landing-zone-accelerator-on-aws
```

???+ warning "Not for ECS"
    This image is for local development and testing only. It is **not suitable for running in Amazon ECS** because the script builds for the host architecture (no `--platform` override). The CI release path builds the ECS-compatible `linux/amd64` image separately.

## Overriding the Node.js heap size

The script reads `NODE_OPTIONS` from your shell at invocation time. If the variable is unset, the script defaults to `--max-old-space-size=8192` and bakes that value into the image's `ENV NODE_OPTIONS` line. To use a different heap size, export `NODE_OPTIONS` before running:

| Command | What you get |
|---|---|
| `../deployment/create-container.sh` | Image with default `NODE_OPTIONS=--max-old-space-size=8192` baked in |
| `NODE_OPTIONS=--max-old-space-size=16384 ../deployment/create-container.sh` | Same image, but with the heap size you supplied baked in |

The script updates the staged `Dockerfile`'s `ENV NODE_OPTIONS=...` line via `sed` before `docker build` runs, so whatever value is in effect at invocation time is what ends up in the image. No `--build-arg` is required.

## How CI / release builds differ

The CI release path (GitLab `release:artifact-al2023-*` jobs, using Kaniko) does **not** invoke `create-container.sh`. CI consumes `container/build/Dockerfile` directly and bakes the Dockerfile's default into the released image. The CI release is always `linux/amd64` with an 16 GiB Node heap, regardless of whatever host the release job runs on.

If you need an ECS-compatible image, use the published release image rather than attempting to reproduce the CI build locally.
