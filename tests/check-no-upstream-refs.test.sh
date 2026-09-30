#!/usr/bin/env bash
set -euo pipefail

sanitizer="${SANITIZER:-$(dirname "$0")/../scripts/check-no-upstream-refs.sh}"
workspace="$(mktemp -d)"
trap 'rm -rf "${workspace}"' EXIT
patch="${workspace}/0001-test.patch"

cat >"${patch}" <<'PATCH'
From 0000000000000000000000000000000000000000 Mon Sep 17 00:00:00 2001
From: Test Author <test@example.com>
Date: Tue, 29 Sep 2026 00:00:00 +0000
Subject: [PATCH] Add color palette

---
 app.ts | 1 +
 1 file changed, 1 insertion(+)

diff --git a/app.ts b/app.ts
index 0000000..1111111 100644
--- a/app.ts
+++ b/app.ts
@@ -0,0 +1 @@
+const colors = ["#000", "#666", "#06f"];
PATCH

PATCH_DIR="${workspace}" bash "${sanitizer}"

cat >"${patch}" <<'PATCH'
From 0000000000000000000000000000000000000000 Mon Sep 17 00:00:00 2001
From: Test Author <test@example.com>
Date: Tue, 29 Sep 2026 00:00:00 +0000
Subject: [PATCH] Restore upstream change

Cherry-picked from https://github.com/getpaseo/paseo/pull/123
---
 app.ts | 1 +
 1 file changed, 1 insertion(+)

diff --git a/app.ts b/app.ts
index 0000000..1111111 100644
--- a/app.ts
+++ b/app.ts
@@ -0,0 +1 @@
+const colors = ["#000", "#666", "#06f"];
PATCH

output="${workspace}/output"
if PATCH_DIR="${workspace}" bash "${sanitizer}" >"${output}" 2>&1; then
  printf 'sanitizer must reject upstream pull-request metadata\n' >&2
  exit 1
fi
if ! grep -Fq 'FORBIDDEN PATTERN: /pull/[0-9]+' "${output}"; then
  printf 'sanitizer must report the upstream pull-request metadata pattern\n' >&2
  exit 1
fi

printf 'patch metadata sanitizer tests passed\n'
