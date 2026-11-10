param([switch]$Focused)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base='09b28c76113da492d5f1004c5217fc37ef5913b4'
$build=Join-Path $PSScriptRoot 'build-m3'
$source=Join-Path $build 'source'
$cache=Join-Path $PSScriptRoot 'build'
$out=Join-Path $PSScriptRoot 'artifacts-m3'
[IO.Directory]::CreateDirectory($source)|Out-Null
$archive=Join-Path $build 'source.tar'
git -C $repo archive --format=tar "--output=$archive" $base
if($LASTEXITCODE -ne 0){throw 'Archive failed'}
tar -xf $archive -C $source
if($LASTEXITCODE -ne 0){throw 'Archive extraction failed'}
$overlays=@('engine/src/nlhe.rs','engine/src/br.rs','engine/tests/raked_convergence.rs','wasm/src/lib.rs')
$sourceFiles=foreach($name in $overlays){
  Copy-Item -LiteralPath (Join-Path $repo $name) -Destination (Join-Path $source $name)
  @{path=$name;sha256=(Get-FileHash -LiteralPath (Join-Path $source $name)).Hash.ToLowerInvariant()}
}
$image='rust@sha256:3914072ca0c3b8aad871db9169a651ccfce30cf58303e5d6f2db16d1d8a7e58f'
docker run --rm --name apt-turn-river-solver-m3-build --label project=apt-turn-river-solver --label purpose=corrected-wasm-build --env "FOCUSED_TESTS=$([int]$Focused.IsPresent)" --mount "type=bind,source=$source,target=/src,readonly" --mount "type=bind,source=$build,target=/work" --mount "type=bind,source=$cache,target=/cache" --mount "type=bind,source=$PSScriptRoot/build-corrected.sh,target=/build.sh,readonly" $image sh /build.sh
if($LASTEXITCODE -ne 0){throw 'Corrected build/tests failed; disposable container removed'}
[IO.Directory]::CreateDirectory($out)|Out-Null
$files=foreach($name in @('solver_wasm.js','solver_wasm_bg.wasm')){
  Copy-Item -LiteralPath (Join-Path $build "pkg/$name") -Destination (Join-Path $out $name)
  $f=Get-Item -LiteralPath (Join-Path $out $name)
  @{name=$name;bytes=$f.Length;sha256=(Get-FileHash -LiteralPath $f.FullName).Hash.ToLowerInvariant()}
}
$manifest=@{sourceRevision=$base;sourceState='base plus local convergence correction; not an upstream commit';sourceFiles=@($sourceFiles);image=$image;rust=[IO.File]::ReadAllText((Join-Path $build 'rust-version.txt'));bindgen=[IO.File]::ReadAllText((Join-Path $build 'bindgen-version.txt')).Trim();files=@($files);builtAt=[DateTime]::UtcNow.ToString('o')}
[IO.File]::WriteAllText((Join-Path $out 'manifest.json'),($manifest|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
Write-Output 'Corrected build complete; identities in benchmark/artifacts-m3/manifest.json'
