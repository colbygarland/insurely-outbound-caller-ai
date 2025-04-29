// Import with `import * as Sentry from "@sentry/node"` if you are using ESM
const Sentry = require('@sentry/node')

Sentry.init({
  dsn: 'https://02492a8c82c12480de10b01184905c15@o4506390906404864.ingest.us.sentry.io/4509237376253952',

  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
})
