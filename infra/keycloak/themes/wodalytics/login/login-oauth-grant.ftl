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

      <!-- Logo row: spans are inline by default so they flow horizontally without flex dependency -->
      <div class="grant-logos" aria-hidden="true">
        <span class="grant-logo-bubble grant-logo-bubble--client">
          <#if client.logoUri?has_content>
            <img src="${client.logoUri}" alt="" class="grant-logo-img">
          <#else>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect width="24" height="24" rx="12" fill="currentColor" opacity="0.08"/>
              <path d="M12 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0 8c-3.3 0-6 1.3-6 3v1h12v-1c0-1.7-2.7-3-6-3z" fill="currentColor"/>
            </svg>
          </#if>
        </span>

        <span class="grant-logo-connector" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 10h10M12 6l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>

        <span class="grant-logo-bubble grant-logo-bubble--wodalytics">
          <!-- WODalytics barbell icon -->
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
            <rect x="3" y="11" width="20" height="4" rx="2" fill="white"/>
            <rect x="1" y="8.5" width="5" height="9" rx="2" fill="white"/>
            <rect x="20" y="8.5" width="5" height="9" rx="2" fill="white"/>
          </svg>
        </span>
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
