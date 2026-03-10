const { exec } = require('child_process')
const fs = require('fs')
const path = require('path')

console.log('🚀 Building BizPOS for Electron...')

// Step 1: Build Next.js app
console.log('📦 Building Next.js application...')
exec('npm run build', (error, stdout, stderr) => {
  if (error) {
    console.error('❌ Next.js build failed:', error)
    return
  }
  
  console.log('✅ Next.js build completed')
  console.log(stdout)
  
  // Step 2: Build Electron app
  console.log('⚡ Building Electron application...')
  exec('npx electron-builder', (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Electron build failed:', error)
      return
    }
    
    console.log('✅ Electron build completed!')
    console.log('📁 Check the dist/ folder for your application')
    console.log(stdout)
  })
})
