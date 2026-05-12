<!DOCTYPE html>
<html lang="${locale!"en"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Session expired – WODalytics</title>
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
</head>
<body>
  <main class="page-container">
    <div class="card">
      <h1 class="heading">Session expired</h1>
      <p class="subheading">Your login session has timed out.</p>

      <a href="${url.loginRestartFlowUrl}" class="btn btn-primary">Start over</a>
      <a href="${url.loginAction}" class="btn btn-outline">Continue where I left off</a>
    </div>
  </main>
</body>
</html>
