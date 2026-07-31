# Deploy automatico in Production su Vercel (senza promozione manuale)

> Documentazione interna — GeoGestioneSpese
> Ultimo aggiornamento: 31/07/2026

## Contesto / Problema

Quando si fa `git push` su `master`, Vercel creava un deploy **Preview** e bisognava
"promuoverlo a Production" a mano dal dashboard.

**Causa:** il progetto Vercel `geo-gestione-spese` aveva il **Production Branch**
impostato su `main`, mentre il repo GitHub usa `master`. Vercel crea il deploy
**Production solo per i push sul branch configurato come production**. Essendo
`main` inesistente, tutti i push su `master` finivano in Preview.

## Come verificare il Production Branch

Con la CLI Vercel autenticata:

```powershell
vercel project inspect geo-gestione-spese --yes
```

Oppure via API (più completo, mostra il campo `link.productionBranch`):

```powershell
$token = (Get-Content "$env:APPDATA\com.vercel.cli\Data\auth.json" -Raw | ConvertFrom-Json).token
$headers = @{ Authorization = "Bearer $token" }
$r = Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/geo-gestione-spese" -Headers $headers -Method Get
$r.link | Select-Object org, repo, productionBranch, type | Format-List
```

Il risultato corretto è:

```
Repo             : GeoGestioneSpese
Org              : PaoloZXS
ProductionBranch : master
Type             : github
```

## Come correggere (unlink + relink via API)

La semplice `PATCH /v9/projects/{id}` **non** accetta il campo `link`, quindi il
modo affidabile è scollegare e ricollegare il repo Git con il branch voluto.

### 1) Recupera l'ID del progetto

```powershell
$token = (Get-Content "$env:APPDATA\com.vercel.cli\Data\auth.json" -Raw | ConvertFrom-Json).token
$headers = @{ Authorization = "Bearer $token" }
$proj = Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/geo-gestione-spese" -Headers $headers -Method Get
$proj.id
# es. prj_FdKC15CU1UgDmOQPE4qEilkJAbaO
```

### 2) Rimuovi il link Git

```powershell
$token = (Get-Content "$env:APPDATA\com.vercel.cli\Data\auth.json" -Raw | ConvertFrom-Json).token
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/<PROJECT_ID>/link" -Headers $headers -Method Delete
```

### 3) Ricollega il repo con `productionBranch`

```powershell
$token = (Get-Content "$env:APPDATA\com.vercel.cli\Data\auth.json" -Raw | ConvertFrom-Json).token
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
$body = '{"type":"github","repo":"GeoGestioneSpese","org":"PaoloZXS","productionBranch":"master"}'
Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/<PROJECT_ID>/link" -Headers $headers -Method Post -Body $body
```

> ⚠️ Attenzione: il campo `productionBranch` nel body viene rispettato **solo**
> al momento del (ri)collegamento. Rifare `POST /link` su un link già esistente
> NON lo aggiorna: serve prima il `DELETE`.

### 4) Verifica

Rileggi il progetto (comando del paragrafo "Come verificare") e controlla che
`ProductionBranch` sia `master`.

## Verifica end-to-end

Dopo la correzione, un push su master deve creare automaticamente un deploy
**Production** (senza promozione manuale).

Test con un commit vuoto:

```powershell
git commit --allow-empty -m "chore: verifica deploy automatico in production su master"
git push origin master
```

Controlla il target del deploy via API:

```powershell
$token = (Get-Content "$env:APPDATA\com.vercel.cli\Data\auth.json" -Raw | ConvertFrom-Json).token
$headers = @{ Authorization = "Bearer $token" }
$r = Invoke-RestMethod -Uri "https://api.vercel.com/v6/deployments?projectId=<PROJECT_ID>&limit=5" -Headers $headers -Method Get
$r.deployments | Select-Object id, target, @{n='gitBranch';e={$_.meta.githubCommitRef}}, readyState, @{n='creato';e={[DateTimeOffset]::FromUnixTimeMilliseconds($_.createdAt).LocalDateTime}} | Format-Table
```

Il deploy nuovo deve avere `target = production`.

## Note

- **URL produzione:** https://geogestionespese.vercel.app
- **Progetto Vercel:** `geo-gestione-spese` (account `paolozxs-projects`)
- **CLI Vercel:** autenticata come `paolozxs`; il token è in
  `%APPDATA%\com.vercel.cli\Data\auth.json`
- Il default branch di GitHub del repo `PaoloZXS/GeoGestioneSpese` è `master`
  (Vercel deve combaciare con questo).
- Comando di riepilogo comodi: `vercel whoami`, `vercel ls`, `vercel project inspect geo-gestione-spese --yes`

## Riferimenti

- Endpoint API usati: `GET|PATCH|DELETE|POST /v9/projects/{idOrName}/link`,
  `GET /v9/projects/{idOrName}`, `GET /v6/deployments`
- Docs Vercel: https://vercel.com/docs/rest-api
