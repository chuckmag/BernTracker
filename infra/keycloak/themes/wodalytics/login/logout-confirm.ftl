<!DOCTYPE html>
<html lang="${locale!"en"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Sign out – WODalytics</title>
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
</head>
<body>
  <main class="page-container">
    <div class="card">
      <h1 class="heading">Sign out</h1>
      <p class="subheading">Are you sure you want to sign out?</p>

      <form action="${url.logoutConfirmAction}" method="POST">
        <input type="hidden" name="session_code" value="${logoutConfirm.code}">
        <button type="submit" name="confirmLogout" id="kc-logout" class="btn btn-primary">Sign out</button>
      </form>

      <#if logoutConfirm.skipLink>
      <#else>
        <#if client?? && client.baseUrl?has_content>
        <a href="${client.baseUrl}" class="btn btn-outline">Cancel</a>
        </#if>
      </#if>
    </div>
  </main>
</body>
</html>
