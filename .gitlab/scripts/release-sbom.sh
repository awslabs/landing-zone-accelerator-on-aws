#!/usr/bin/env bash
set -euo pipefail

readonly TRIVY_VERSION="0.69.3"
# SHA-256 for the Trivy 0.69.3 Linux amd64 release archive.
readonly TRIVY_LINUX_AMD64_SHA256="1816b632dfe529869c740c0913e36bd1629cb7688bd5634f4a858c1d57c88b75"
readonly EVIDENCE_DIR="${CI_PROJECT_DIR:-$(pwd)}/release-sbom"
readonly TRIVY_CACHE_DIR="${CI_PROJECT_DIR:-$(pwd)}/.trivy-cache"
export TRIVY_CACHE_DIR

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_environment() {
  [ "${CI_PROJECT_ID:-}" = "21753" ] || fail "release SBOM generation is restricted to project 21753"
  [ -n "${CI_COMMIT_TAG:-}" ] || fail "CI_COMMIT_TAG is required"
  [ -n "${CI_COMMIT_SHA:-}" ] || fail "CI_COMMIT_SHA is required"
}

verify_archive_sha256() {
  local archive="$1"
  local expected="$2"
  local -a check_args=(-c)

  if sha256sum --help 2>&1 | grep -q -- '--strict'; then
    check_args+=(--strict)
  fi
  printf '%s  %s\n' "$expected" "$archive" | sha256sum "${check_args[@]}" -
}

install_trivy() {
  local archive="trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz"
  local release_url="https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}"

  wget --progress=dot:mega -O "/tmp/${archive}" "${release_url}/${archive}"
  verify_archive_sha256 "/tmp/${archive}" "$TRIVY_LINUX_AMD64_SHA256"
  tar -xzf "/tmp/${archive}" -C /tmp trivy
  install -m 0755 /tmp/trivy /usr/local/bin/trivy
  trivy --version
}

component_version() {
  local sbom="$1"
  local expected="$2"
  jq -er --arg expected "$expected" '
    first(
      .components[]?
      | select(
          .name == $expected
          or (((.group // "") + "/" + (.name // "")) == $expected)
          or ((.purl // "") | test("^pkg:[^/]+/(%40|@)?" + ($expected | sub("^@"; "") | gsub("/"; "(%2F|/)") | gsub("-"; "[-]")) + "@"; "i"))
        )
      | .version
      | select(type == "string" and length > 0)
    )
  ' "$sbom" || fail "CycloneDX SBOM ${sbom} is missing required component ${expected} with a version"
}

generate_sbom() {
  require_environment
  install_trivy

  [ -d source/node_modules ] || fail "source/node_modules is absent; accelerator:build must provide the immutable installed tree"
  [ -f source/yarn.lock ] || fail "source/yarn.lock is absent"

  local cdk_package asset_package asset_root layer_zip awscli_metadata image_tar
  cdk_package="$(find source/node_modules -path '*/aws-cdk-lib/package.json' -print -quit)"
  [ -n "$cdk_package" ] || fail "bundled dependency aws-cdk-lib is absent from the installed tree"

  asset_package="$(find source/node_modules -path '*/@aws-cdk/asset-awscli-v1/package.json' -print -quit)"
  [ -n "$asset_package" ] || fail "bundled dependency @aws-cdk/asset-awscli-v1 is absent from the installed tree"
  asset_root="$(dirname "$asset_package")"
  layer_zip="${asset_root}/lib/layer.zip"
  [ -f "$layer_zip" ] || fail "embedded AWS CLI payload ${layer_zip} is absent"

  rm -rf "${asset_root}/.release-sbom-awscli-layer"
  mkdir -p "${asset_root}/.release-sbom-awscli-layer"
  unzip -q "$layer_zip" -d "${asset_root}/.release-sbom-awscli-layer"
  awscli_metadata="$(find "${asset_root}/.release-sbom-awscli-layer" -path '*/awscli-*.dist-info/METADATA' -print -quit)"
  [ -n "$awscli_metadata" ] || fail "embedded awscli package metadata is absent from @aws-cdk/asset-awscli-v1"

  image_tar="deployment/ecr/lza-${CI_COMMIT_TAG}-al2023.tar.gz"
  [ -f "$image_tar" ] || fail "final Kaniko image archive ${image_tar} is absent"
  tar -tf "$image_tar" >/dev/null || fail "final Kaniko image archive ${image_tar} is not a readable Docker/OCI tar archive"

  mkdir -p "$EVIDENCE_DIR"
  # CycloneDX output disables vulnerability scanning unless --scanners vuln is explicit.
  # Rootfs mode inventories installed package metadata, including the extracted Python wheel packages.
  trivy rootfs --format cyclonedx --output "$EVIDENCE_DIR/source.cdx.json" source
  trivy image --input "$image_tar" --format cyclonedx --output "$EVIDENCE_DIR/container.cdx.json"

  local cdk_version asset_version awscli_version lockfile_sha image_sha
  cdk_version="$(component_version "$EVIDENCE_DIR/source.cdx.json" 'aws-cdk-lib')"
  asset_version="$(component_version "$EVIDENCE_DIR/source.cdx.json" '@aws-cdk/asset-awscli-v1')"
  awscli_version="$(component_version "$EVIDENCE_DIR/source.cdx.json" 'awscli')"
  lockfile_sha="$(sha256sum source/yarn.lock | awk '{print $1}')"
  image_sha="$(sha256sum "$image_tar" | awk '{print $1}')"

  trivy --version > "$EVIDENCE_DIR/trivy-version.txt"
  jq -n \
    --arg releaseTag "$CI_COMMIT_TAG" \
    --arg commitSha "$CI_COMMIT_SHA" \
    --arg generatedAt "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    --arg trivyVersion "$TRIVY_VERSION" \
    --arg trivyArchiveSha256 "$TRIVY_LINUX_AMD64_SHA256" \
    --arg lockfileSha256 "$lockfile_sha" \
    --arg cdkVersion "$cdk_version" \
    --arg assetVersion "$asset_version" \
    --arg awscliVersion "$awscli_version" \
    --arg imageArchive "$image_tar" \
    --arg imageArchiveSha256 "$image_sha" \
    '{
      releaseTag: $releaseTag,
      commitSha: $commitSha,
      generatedAt: $generatedAt,
      installedTree: {
        source: "accelerator:build artifact produced by immutable Yarn install",
        lockfile: "source/yarn.lock",
        lockfileSha256: $lockfileSha256
      },
      requiredComponents: {
        "aws-cdk-lib": $cdkVersion,
        "@aws-cdk/asset-awscli-v1": $assetVersion,
        awscli: $awscliVersion
      },
      trivy: {
        version: $trivyVersion,
        archiveSha256: $trivyArchiveSha256
      },
      containerImage: {
        source: "Kaniko --no-push final image archive",
        archive: $imageArchive,
        archiveSha256: $imageArchiveSha256,
        contentIdentity: ("sha256:" + $imageArchiveSha256)
      }
    }' > "$EVIDENCE_DIR/generation-metadata.json"

  (
    cd "$EVIDENCE_DIR"
    sha256sum source.cdx.json container.cdx.json generation-metadata.json trivy-version.txt > SHA256SUMS
  )
}

scan_sbom() {
  require_environment
  install_trivy

  [ -f "$EVIDENCE_DIR/source.cdx.json" ] || fail "stored source CycloneDX SBOM is absent"
  [ -f "$EVIDENCE_DIR/container.cdx.json" ] || fail "stored container CycloneDX SBOM is absent"
  [ -f "$EVIDENCE_DIR/SHA256SUMS" ] || fail "stored SBOM checksums are absent"
  (cd "$EVIDENCE_DIR" && sha256sum --check SHA256SUMS)

  trivy sbom --scanners vuln --format json --output "$EVIDENCE_DIR/source-vulnerabilities.json" "$EVIDENCE_DIR/source.cdx.json"
  trivy sbom --scanners vuln --format json --output "$EVIDENCE_DIR/container-vulnerabilities.json" "$EVIDENCE_DIR/container.cdx.json"
  [ -f "$TRIVY_CACHE_DIR/db/metadata.json" ] || fail "Trivy vulnerability database metadata is absent after SBOM scan"
  cp "$TRIVY_CACHE_DIR/db/metadata.json" "$EVIDENCE_DIR/scan-db-metadata.json"

  local public_prefix public_source_sbom public_container_sbom public_checksums
  public_prefix="lza-${CI_COMMIT_TAG}"
  public_source_sbom="${public_prefix}-source.cdx.json"
  public_container_sbom="${public_prefix}-container.cdx.json"
  public_checksums="${public_prefix}-sbom-SHA256SUMS"
  cp "$EVIDENCE_DIR/source.cdx.json" "$EVIDENCE_DIR/$public_source_sbom"
  cp "$EVIDENCE_DIR/container.cdx.json" "$EVIDENCE_DIR/$public_container_sbom"
  (
    cd "$EVIDENCE_DIR"
    sha256sum "$public_source_sbom" "$public_container_sbom" > "$public_checksums"
  )

  jq -n \
    --arg releaseTag "$CI_COMMIT_TAG" \
    --arg commitSha "$CI_COMMIT_SHA" \
    --arg scannedAt "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    --arg trivyVersion "$TRIVY_VERSION" \
    --argjson sourceVulnerabilityCount "$(jq '[.Results[]?.Vulnerabilities[]?] | length' "$EVIDENCE_DIR/source-vulnerabilities.json")" \
    --argjson containerVulnerabilityCount "$(jq '[.Results[]?.Vulnerabilities[]?] | length' "$EVIDENCE_DIR/container-vulnerabilities.json")" \
    --slurpfile database "$EVIDENCE_DIR/scan-db-metadata.json" \
    '{
      releaseTag: $releaseTag,
      commitSha: $commitSha,
      scannedAt: $scannedAt,
      trivy: {
        version: $trivyVersion,
        database: $database[0]
      },
      vulnerabilityCounts: {
        source: $sourceVulnerabilityCount,
        container: $containerVulnerabilityCount
      }
    }' > "$EVIDENCE_DIR/scan-metadata.json"

  (
    cd "$EVIDENCE_DIR"
    sha256sum source.cdx.json container.cdx.json generation-metadata.json trivy-version.txt source-vulnerabilities.json container-vulnerabilities.json scan-db-metadata.json scan-metadata.json "$public_source_sbom" "$public_container_sbom" "$public_checksums" > SHA256SUMS
  )
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  case "${1:-}" in
    generate)
      generate_sbom
      ;;
    scan)
      scan_sbom
      ;;
    *)
      fail "usage: $0 {generate|scan}"
      ;;
  esac
fi
