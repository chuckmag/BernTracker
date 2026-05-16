<!DOCTYPE html>
<html lang="${locale!"en"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Check your email – WODalytics</title>
  <link rel="stylesheet" href="${url.resourcesPath}/css/login.css">
</head>
<body>
  <main class="page-container">
    <div class="card">
      <h1 class="heading">Check your email</h1>
      <p class="subheading">
        We sent a confirmation link to <strong>${brokerContext.username}</strong>
        to finish linking your ${idpDisplayName} account.
      </p>

      <p class="subheading">
        Confirmed your email?
        <a href="${url.loginAction}" class="forgot-link" style="display:inline;">Click here</a> to continue.
      </p>

      <p class="subheading">
        Link expired?
        <a href="${url.loginAction}" class="forgot-link" style="display:inline;">Click here</a> to request a new one.
      </p>
    </div>
  </main>
</body>
</html>
