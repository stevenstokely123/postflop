$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$revision = '09b28c76113da492d5f1004c5217fc37ef5913b4'
$buildRoot = Join-Path $PSScriptRoot 'build'
$sourceRoot = Join-Path $buildRoot 'source'
[IO.Directory]::CreateDirectory($sourceRoot) | Out-Null
docker version --format '{{.Server.Version}}'
if ($LASTEXITCODE -ne 0) { throw 'Docker engine unavailable' }
[IO.File]::WriteAllLines((Join-Path $buildRoot 'containers-before.jsonl'), [string[]]@(docker ps -a --format '{{json .}}'))
[IO.File]::WriteAllLines((Join-Path $buildRoot 'volumes-before.jsonl'), [string[]]@(docker volume ls --format '{{json .}}'))
$archivePath = Join-Path $buildRoot 'source.tar'
git -C $projectRoot archive --format=tar "--output=$archivePath" $revision
if ($LASTEXITCODE -ne 0) { throw 'Pinned git archive failed' }
tar -xf (Join-Path $buildRoot 'source.tar') -C $sourceRoot
if ($LASTEXITCODE -ne 0) { throw 'Pinned archive extraction failed' }
$imageTag = 'rust@sha256:3914072ca0c3b8aad871db9169a651ccfce30cf58303e5d6f2db16d1d8a7e58f'
docker pull $imageTag
if ($LASTEXITCODE -ne 0) { throw 'Rust build image pull failed' }
$imageDigest = (docker image inspect --format '{{index .RepoDigests 0}}' $imageTag).Trim()
$containerName = 'apt-turn-river-solver-wasm-09b28c7'
docker run --rm --name $containerName --label 'project=apt-turn-river-solver' --label 'purpose=pinned-wasm-build' --mount "type=bind,source=$sourceRoot,target=/src,readonly" --mount "type=bind,source=$buildRoot,target=/work" --mount "type=bind,source=$PSScriptRoot/build-pinned.sh,target=/build.sh,readonly" $imageDigest sh /build.sh
if ($LASTEXITCODE -ne 0) { throw 'Pinned WASM build failed; disposable container removed' }
[IO.File]::WriteAllLines((Join-Path $buildRoot 'containers-after.jsonl'), [string[]]@(docker ps -a --format '{{json .}}'))
[IO.File]::WriteAllLines((Join-Path $buildRoot 'volumes-after.jsonl'), [string[]]@(docker volume ls --format '{{json .}}'))
$artifactRoot = Join-Path $PSScriptRoot 'artifacts-pinned'
[IO.Directory]::CreateDirectory($artifactRoot) | Out-Null
$files = foreach ($name in @('solver_wasm.js','solver_wasm_bg.wasm')) {
  Copy-Item -LiteralPath (Join-Path $buildRoot "pkg/$name") -Destination (Join-Path $artifactRoot $name)
  $file = Get-Item -LiteralPath (Join-Path $artifactRoot $name)
  @{ name=$name; bytes=$file.Length; sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
}
$manifest = @{
  builtAt=[DateTime]::UtcNow.ToString('o'); sourceRevision=$revision; checkout=$revision;
  sourceArchiveSha256=(Get-FileHash -LiteralPath (Join-Path $buildRoot 'source.tar')).Hash.ToLowerInvariant();
  cargoLockSha256=(Get-FileHash -LiteralPath (Join-Path $sourceRoot 'Cargo.lock')).Hash.ToLowerInvariant();
  image=$imageDigest; rust=[IO.File]::ReadAllText((Join-Path $buildRoot 'rust-version.txt'));
  bindgen=(Get-Content -LiteralPath (Join-Path $buildRoot 'bindgen-version.txt') -Raw).Trim();
  bindgenArchiveSha256=(Get-Content -LiteralPath (Join-Path $buildRoot 'bindgen.sha256') -Raw).Split(' ')[0];
  command='cargo build --locked --release --target wasm32-unknown-unknown -p solver-wasm; wasm-bindgen --target web (no wasm-opt)'; files=@($files)
}
[IO.File]::WriteAllText((Join-Path $artifactRoot 'manifest.json'), ($manifest | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
Write-Output "Built pinned WASM $revision in disposable container; manifest: $artifactRoot/manifest.json"
