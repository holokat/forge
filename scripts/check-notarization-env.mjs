#!/usr/bin/env node

const required = [
  'APPLE_API_KEY',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER',
  'APPLE_TEAM_ID'
]

const missing = required.filter((name) => !process.env[name])

if (missing.length > 0) {
  console.error('Missing macOS notarization environment variables:')
  for (const name of missing) {
    console.error(`- ${name}`)
  }
  console.error('')
  console.error('Set these before creating a public macOS release.')
  console.error('Use APPLE_API_KEY as the absolute path to AuthKey_<key-id>.p8.')
  process.exit(1)
}

console.log('macOS notarization environment looks ready.')
