$ErrorActionPreference='Stop'
$dir=Join-Path $PSScriptRoot '../artifacts/internal-links-pilot'
$secure=ConvertTo-SecureString ((Get-Content (Join-Path $dir 'pilot-key.dpapi') -Raw).Trim())
$headers=@{'X-API-Key'=[System.Net.NetworkCredential]::new('', $secure).Password}
$sample=Get-Content (Join-Path $dir 'sample.json') -Raw | ConvertFrom-Json
$out=Join-Path $dir 'plans.jsonl'
$done=[Collections.Generic.HashSet[long]]::new()
foreach($file in @('first-plan.json','preflight.jsonl','plans.jsonl')){
  $path=Join-Path $dir $file
  if(Test-Path -LiteralPath $path){
    foreach($line in (Get-Content -LiteralPath $path)){
      if($line.Trim()){ [void]$done.Add(($line | ConvertFrom-Json).id) }
    }
  }
}
foreach($post in $sample){
  if($done.Contains($post.id)){continue}
  for($attempt=1;$attempt -le 3;$attempt++){
    $response=Invoke-WebRequest -Method Post -Uri "https://diario.dopovo.com.br/api/n8n/internal-links/$($post.id)/plan" -Headers $headers -MaximumRedirection 0 -TimeoutSec 65 -SkipHttpErrorCheck
    if($response.StatusCode -eq 200){break}
    if($response.StatusCode -notin @(429,500,502,503,504) -or $attempt -eq 3){throw "HTTP $($response.StatusCode) para matéria $($post.id)"}
    Start-Sleep -Seconds (5*$attempt)
  }
  $plan=$response.Content | ConvertFrom-Json
  if($plan.id -ne $post.id -or $null -eq $plan.links){throw "Resposta inválida para matéria $($post.id)"}
  $plan | ConvertTo-Json -Depth 8 -Compress | Add-Content -LiteralPath $out -Encoding utf8
  [void]$done.Add($post.id)
  if($done.Count % 25 -eq 0){Write-Output "$($done.Count)/$($sample.Count)"}
}
Write-Output "Concluído: $($done.Count)/$($sample.Count)"
