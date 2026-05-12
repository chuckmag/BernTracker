<!DOCTYPE html>
<html lang="${locale!"en"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Grant Access – WODalytics</title>
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
</head>
<body>
  <main class="page-container">
    <div class="card grant-card">

      <#assign clientLabel = client.name?has_content?then(client.name, client.clientId)>

      <div class="grant-logos" aria-hidden="true">
        <div class="grant-logo-bubble grant-logo-bubble--client">${clientLabel?substring(0, 1)?upper_case}</div>
        <svg class="grant-logo-arrow" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div class="grant-logo-bubble grant-logo-bubble--wodalytics">W</div>
      </div>

      <h1 class="grant-title">
        <span class="grant-client-name">${clientLabel}</span>
        wants to access your WODalytics account
      </h1>

      <#if oauth.clientScopesRequested?has_content>
      <ul class="scope-list" role="list" aria-label="Requested permissions">
        <#list oauth.clientScopesRequested as scope>
        <li class="scope-item">
          <svg class="scope-check" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="10" fill="#dcfce7"/>
            <path d="M6 10l3 3 5-5" stroke="#16a34a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>${kcSanitize(msg(scope.consentScreenText))?no_esc}</span>
        </li>
        </#list>
      </ul>
      </#if>

      <form action="${url.oauthAction}" method="POST" class="grant-actions">
        <input type="hidden" name="code" value="${oauth.code}">
        <button type="submit" name="cancel" class="btn btn-outline">Deny</button>
        <button type="submit" name="accept" class="btn btn-primary">Allow access</button>
      </form>

    </div>
  </main>
</body>
</html>
