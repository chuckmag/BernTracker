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
    <div class="card">
      <h1 class="heading">Grant Access</h1>
      <p class="subheading">
        <#if client.name?has_content>
          ${client.name}
        <#else>
          ${client.clientId}
        </#if>
        is requesting access to your WODalytics account.
      </p>

      <#if oauth.clientScopesRequested?has_content>
      <ul class="scope-list">
        <#list oauth.clientScopesRequested as scope>
        <li class="scope-item">${scope.consentScreenText}</li>
        </#list>
      </ul>
      </#if>

      <form action="${url.oauthAction}" method="POST">
        <input type="hidden" name="code" value="${oauth.code}">
        <button type="submit" name="accept" class="btn btn-primary">Allow access</button>
        <button type="submit" name="cancel" class="btn btn-outline">Deny</button>
      </form>
    </div>
  </main>
</body>
</html>
