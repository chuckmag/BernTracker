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

      <div class="grant-logos">
        <#assign clientLogoUri = (client.attributes["logo_uri"])!"">
        <div class="grant-logo-bubble grant-logo-bubble--client" aria-hidden="true">
          <#if clientLogoUri?has_content>
            <img src="${clientLogoUri}" alt="" class="grant-logo-img">
          <#else>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="8" r="4" fill="currentColor"/>
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </#if>
        </div>

        <div class="grant-logo-arrow" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>

        <div class="grant-logo-bubble grant-logo-bubble--wodalytics" aria-hidden="true">
          <img src="${url.resourcesPath}/img/favicon.png" alt="WODalytics" class="grant-logo-img">
        </div>
      </div>

      <h1 class="grant-title">
        <strong>${clientLabel}</strong> wants to access<br>your WODalytics account
      </h1>

      <#if oauth.clientScopesRequested?has_content>
      <ul class="scope-list">
        <#list oauth.clientScopesRequested as scope>
        <li class="scope-item">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" class="scope-check" aria-hidden="true">
            <circle cx="9" cy="9" r="9" fill="#dcfce7"/>
            <path d="M5.5 9l2.5 2.5 4.5-4.5" stroke="#16a34a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
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
