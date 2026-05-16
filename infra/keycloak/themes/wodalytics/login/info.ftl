<!DOCTYPE html>
<html lang="${locale!"en"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>WODalytics</title>
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
</head>
<body>
  <main class="page-container">
    <div class="card">
      <#if messageHeader?has_content>
      <h1 class="heading">${kcSanitize(messageHeader)?no_esc}</h1>
      <#else>
      <h1 class="heading">WODalytics</h1>
      </#if>

      <#if message?has_content>
      <p class="subheading">${kcSanitize(message.summary)?no_esc}</p>
      </#if>

      <#if skipLink??>
      <#else>
        <#if pageRedirectUri?has_content>
        <a href="${pageRedirectUri}" class="btn btn-primary">Continue</a>
        <#elseif actionUri?has_content>
        <a href="${actionUri}" class="btn btn-primary">Continue</a>
        <#elseif client.baseUrl?has_content>
        <a href="${client.baseUrl}" class="btn btn-primary">Back to application</a>
        </#if>
      </#if>
    </div>
  </main>
</body>
</html>
