<!DOCTYPE html>
<html lang="${locale!"en"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Error – WODalytics</title>
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
</head>
<body>
  <main class="page-container">
    <div class="card">
      <h1 class="heading">Something went wrong</h1>

      <#if message?has_content>
      <p class="subheading">${kcSanitize(message.summary)?no_esc}</p>
      </#if>

      <#if skipLink??>
      <#else>
        <#if client?? && client.baseUrl?has_content>
        <a href="${client.baseUrl}" class="btn btn-primary">Back to application</a>
        </#if>
      </#if>
    </div>
  </main>
</body>
</html>
