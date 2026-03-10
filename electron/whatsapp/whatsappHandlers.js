const path = require('path');
const fs = require('fs');
const { Builder, By, until, Key } = require('selenium-webdriver');
const edge = require('selenium-webdriver/edge');
const { createClient } = require('@supabase/supabase-js');
const { nativeImage, clipboard } = require('electron');
const { ensureEdgeDriverVersion } = require('./edgeDriverManager');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gmmjefeojrpazhacqihk.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtbWplZmVvanJwYXpoYWNxaWhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0OTIzOTcsImV4cCI6MjA3MDA2ODM5N30.3lu4RPAt3z1Ux-qRtqqNLeCAcf8tAU4aywHIjfEA3JE';
const supabase = createClient(supabaseUrl, supabaseKey);

let browserActive = false;
let statusCheckInterval = null;
let driver = null;

// WhatsApp Web XPaths (provided by user)
const XPATHS = {
  MESSAGE_INPUT: "//footer//div[@contenteditable='true']",
  MESSAGE_INPUT_WITH_IMAGE: "//div[@aria-label='Type a message']//p[@class='selectable-text copyable-text x15bjb6t x1n2onr6']",
  SEND_BUTTON: "//span[@data-icon='wds-ic-send-filled']",
  ATTACH_BUTTON: "//span[@data-icon='plus-rounded']",
  PHOTO_VIDEO_OPTION: "//span[normalize-space()='Photos & videos']",
  MESSAGE_TIME: "//span[@class='x1rg5ohu x16dsc37']", // Time indicator for sent messages
  INVALID_NUMBER_OK_BUTTON: "//span[normalize-space(text())='OK']" // OK button for invalid number popup
};

async function startSeleniumBrowser() {
  try {
    const userDataDir = path.join(process.env.APPDATA, 'WhatsAppWebSession');

    console.log('Starting Selenium Edge browser for WhatsApp Web...');

    // Determine the EdgeDriver path based on whether we're in development or production
    let edgeDriverPath;
    if (process.env.NODE_ENV === 'production' || process.resourcesPath) {
      // In production, use user data directory (writable location) instead of resources
      // This allows EdgeDriver to be updated even in packaged app
      const { app } = require('electron');
      const driversDir = path.join(app.getPath('userData'), 'drivers');

      // Ensure drivers directory exists
      if (!fs.existsSync(driversDir)) {
        fs.mkdirSync(driversDir, { recursive: true });
      }

      edgeDriverPath = path.join(driversDir, 'msedgedriver.exe');

      // If driver doesn't exist in user data, try to copy from resources as fallback
      if (!fs.existsSync(edgeDriverPath)) {
        const resourcesDriverPath = path.join(process.resourcesPath || '', 'drivers', 'msedgedriver.exe');
        if (fs.existsSync(resourcesDriverPath)) {
          console.log('Copying EdgeDriver from resources to user data directory...');
          try {
            fs.copyFileSync(resourcesDriverPath, edgeDriverPath);
          } catch (copyError) {
            console.log('Could not copy from resources, will download fresh version');
          }
        }
      }
    } else {
      // In development, use the driver from the electron folder
      edgeDriverPath = path.join(__dirname, '..', 'drivers', 'msedgedriver.exe');
    }

    console.log('EdgeDriver path:', edgeDriverPath);

    // Always check EdgeDriver version to ensure compatibility with installed Edge
    try {
      console.log('Checking EdgeDriver version compatibility...');
      await ensureEdgeDriverVersion(edgeDriverPath);
      console.log('EdgeDriver version verified and compatible');
    } catch (error) {
      console.error('EdgeDriver version check failed:', error);
      throw new Error(`EdgeDriver version mismatch or download failed: ${error.message}\n\nPlease ensure Microsoft Edge is installed and up to date.`);
    }

    // Configure Edge service to use the specific driver path
    const service = new edge.ServiceBuilder(edgeDriverPath);

    // Configure Edge options
    const options = new edge.Options();
    options.addArguments(`--user-data-dir=${userDataDir}`);
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--disable-gpu');
    options.addArguments('--window-size=1200,900');
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.addArguments('--disable-extensions');
    options.addArguments('--disable-infobars');
    options.addArguments('--disable-background-timer-throttling');
    options.addArguments('--disable-backgrounding-occluded-windows');
    options.addArguments('--disable-renderer-backgrounding');
    options.addArguments('--remote-debugging-port=9222');

    // Exclude automation switches to avoid detection
    options.excludeSwitches('enable-automation');
    options.excludeSwitches('enable-logging');

    // Add preferences to improve stability
    options.setUserPreferences({
      'profile.default_content_setting_values.notifications': 2,
      'profile.default_content_settings.popups': 0
    });

    // Build the driver with explicit EdgeDriver path
    driver = await new Builder()
      .forBrowser('MicrosoftEdge')
      .setEdgeService(service)
      .setEdgeOptions(options)
      .build();

    // Navigate to WhatsApp Web
    await driver.get('https://web.whatsapp.com');

    browserActive = true;

    console.log('Edge browser started. Please scan QR code if needed.');

    return { success: true, message: 'Browser started' };
  } catch (error) {
    console.error('Error starting Selenium:', error);
    browserActive = false;
    throw error;
  }
}

async function isDriverActive() {
  try {
    if (driver) {
      await driver.getTitle();
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

async function sendWhatsAppMessage(phone, message, mediaPath = null) {
  try {
    if (!driver) {
      throw new Error('Browser driver is not available');
    }

    console.log(`Opening chat for: ${phone}`);

    // Navigate to chat using phone number
    const chatUrl = `https://web.whatsapp.com/send?phone=${phone}`;
    await driver.get(chatUrl);

    // Race condition: Wait for EITHER message input OR invalid number popup
    console.log('Waiting for either message input or invalid number popup...');

    let messageInput = null;

    try {
      // Use Promise.race to wait for whichever appears first
      const result = await Promise.race([
        // Option 1: Message input appears (valid number)
        driver.wait(until.elementLocated(By.xpath(XPATHS.MESSAGE_INPUT)), 300000)
          .then(() => ({ type: 'valid' })),

        // Option 2: Invalid number popup appears
        driver.wait(until.elementLocated(By.xpath(XPATHS.INVALID_NUMBER_OK_BUTTON)), 300000)
          .then(() => ({ type: 'invalid' }))
      ]);

      if (result.type === 'invalid') {
        console.log(`⚠️ Invalid phone number detected: ${phone}`);

        // Click OK button to dismiss the popup
        const okButton = await driver.findElement(By.xpath(XPATHS.INVALID_NUMBER_OK_BUTTON));
        await okButton.click();
        await driver.sleep(500);

        throw new Error('INVALID_NUMBER: Phone number shared via url is invalid');
      }

      // Valid number - get the message input
      messageInput = await driver.findElement(By.xpath(XPATHS.MESSAGE_INPUT));
      console.log('✅ Message input found - valid number');

    } catch (error) {
      if (error.message.includes('INVALID_NUMBER')) {
        throw error; // Re-throw invalid number error
      }
      // If both elements failed to appear, throw original error
      throw new Error(`Failed to find message input or invalid number popup: ${error.message}`);
    }

    await driver.sleep(2000); // Wait for chat to fully load

    // Handle two cases: with image and without image
    if (mediaPath) {
      // CASE 1: Message with image
      try {
        console.log(`Attaching media via clipboard: ${mediaPath}`);

        // Check if file exists
        if (!fs.existsSync(mediaPath)) {
          throw new Error(`Media file not found: ${mediaPath}`);
        }

        // Read the image file and copy to clipboard
        const imageBuffer = fs.readFileSync(mediaPath);
        const image = nativeImage.createFromBuffer(imageBuffer);

        if (image.isEmpty()) {
          throw new Error('Failed to create image from file');
        }

        // Copy image to clipboard
        clipboard.writeImage(image);
        console.log('✅ Image copied to clipboard');

        await driver.sleep(500);

        // Click on message input to focus
        await messageInput.click();
        await driver.sleep(500);

        // Paste image using Ctrl+V
        console.log('Pasting image from clipboard...');
        await messageInput.sendKeys(Key.chord(Key.CONTROL, 'v'));
        await driver.sleep(3000); // Wait for image to be pasted and preview to appear

        console.log('✅ Image pasted successfully');

        // After image is pasted, WhatsApp changes the input field
        // Find the new message input field for typing caption/message
        console.log('Finding message input field after image paste...');
        const messageInputWithImage = await driver.wait(
          until.elementLocated(By.xpath(XPATHS.MESSAGE_INPUT_WITH_IMAGE)),
          10000
        );

        // Type message as caption
        if (message && message.trim()) {
          console.log('Typing message caption...');
          await messageInputWithImage.click();
          await driver.sleep(500);
          await messageInputWithImage.sendKeys(message);
          await driver.sleep(1000);
        }

        // Click send button to send image with message
        console.log('Clicking send button for image...');
        const sendButton = await driver.wait(
          until.elementLocated(By.xpath(XPATHS.SEND_BUTTON)),
          10000
        );
        await sendButton.click();

      } catch (mediaError) {
        console.error('Error attaching media via clipboard:', mediaError);
        throw mediaError; // Throw error so it's caught in the main try-catch
      }
    } else {
      // CASE 2: Text message only (no image)
      console.log('Sending text message only...');

      // Type message
      await messageInput.click();
      await driver.sleep(500);
      await messageInput.sendKeys(message);
      await driver.sleep(1000);

      // Click send button
      console.log('Clicking send button...');
      const sendButton = await driver.wait(
        until.elementLocated(By.xpath(XPATHS.SEND_BUTTON)),
        10000
      );
      await sendButton.click();
    }

    // Wait to confirm message sent
    await driver.sleep(2000);

    console.log(`✅ Message sent successfully to ${phone}`);
    return true;

  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    throw error;
  }
}

async function monitorBrowserStatus() {
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval);
  }

  statusCheckInterval = setInterval(async () => {
    const isActive = await isDriverActive();
    if (!isActive && browserActive) {
      console.log('Browser closed by user');
      browserActive = false;
      if (driver) {
        await driver.quit().catch(() => {});
        driver = null;
      }
    }
  }, 5000);
}

function registerWhatsAppHandlers(ipcMain) {
  ipcMain.handle('whatsapp-connect', async (event) => {
    try {
      if (browserActive && driver) {
        const isActive = await isDriverActive();
        if (isActive) {
          return {
            success: true,
            message: 'Browser is already running',
            isConnected: true
          };
        }
      }

      const result = await startSeleniumBrowser();
      monitorBrowserStatus();

      return {
        success: true,
        message: 'Please scan QR code in browser to connect WhatsApp',
        isConnected: false
      };
    } catch (error) {
      console.error('Error connecting WhatsApp:', error);
      return {
        success: false,
        error: error.message || 'Failed to start browser',
        message: error.message || 'Failed to start browser',
        isConnected: false
      };
    }
  });

  ipcMain.handle('whatsapp-check-connection', async (event) => {
    try {
      const isActive = await isDriverActive();
      browserActive = isActive;

      return {
        success: true,
        isConnected: isActive
      };
    } catch (error) {
      return {
        success: false,
        isConnected: false,
        error: error.message
      };
    }
  });

  ipcMain.handle('whatsapp-disconnect', async (event) => {
    try {
      if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
        statusCheckInterval = null;
      }

      if (driver) {
        await driver.quit();
        driver = null;
      }

      browserActive = false;

      return {
        success: true,
        message: 'WhatsApp disconnected'
      };
    } catch (error) {
      console.error('Error disconnecting WhatsApp:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle('whatsapp-send-campaign', async (event, data) => {
    try {
      const { customers, message, mediaPath, campaignId, userEmail } = data;

      if (!browserActive || !driver) {
        return {
          success: false,
          error: 'WhatsApp Web is not connected. Please connect first.'
        };
      }

      console.log(`Starting campaign for ${customers.length} customers`);

      // Create campaign record in database
      let dbCampaignId = null;
      try {
        const { data: campaignData, error: campaignError } = await supabase
          .from('marketing_campaigns')
          .insert({
            user_email: userEmail,
            campaign_name: campaignId,
            campaign_type: 'whatsapp',
            message_template: message,
            media_path: mediaPath || null,
            total_numbers: customers.length,
            sent_count: 0,
            failed_count: 0,
            pending_count: customers.length,
            status: 'processing'
          })
          .select()
          .single();

        if (campaignError) {
          console.error('Error creating campaign record:', campaignError);
        } else {
          dbCampaignId = campaignData.id;
          console.log('Campaign record created:', dbCampaignId);
        }
      } catch (dbError) {
        console.error('Error creating campaign:', dbError);
      }

      let successCount = 0;
      let failedCount = 0;

      for (let i = 0; i < customers.length; i++) {
        const customer = customers[i];

        try {
          // Format phone number
          const phone = formatPhoneForWhatsApp(customer.phone);

          // Debug: Log customer data
          console.log('\n📋 Customer data:', JSON.stringify(customer, null, 2));

          // Personalize message with new schema
          let personalizedMessage = message;

          // Replace {full_name} with full_name or "Sir" if empty/null
          const fullName = (customer.full_name && customer.full_name.trim() !== '')
            ? customer.full_name.trim()
            : 'Sir';

          console.log(`📝 Original message: "${message}"`);
          console.log(`👤 Full name value: "${customer.full_name}"`);
          console.log(`✨ Using name: "${fullName}"`);

          personalizedMessage = personalizedMessage.replace(/{full_name}/g, fullName);

          // Replace {phone}
          if (customer.phone) {
            personalizedMessage = personalizedMessage.replace(/{phone}/g, customer.phone);
          }

          console.log(`📨 Personalized message: "${personalizedMessage}"`);
          console.log(`\n[${i + 1}/${customers.length}] Sending to ${fullName} (${phone})`);

          // Send WhatsApp message using Selenium
          await sendWhatsAppMessage(phone, personalizedMessage, mediaPath);

          successCount++;

          // Save message status to database
          if (dbCampaignId) {
            try {
              await supabase.from('message_status').insert({
                campaign_id: dbCampaignId,
                phone_number: phone,
                first_name: fullName, // Use fullName (which is already "Sir" if null)
                last_name: null, // No longer used, set to null
                message_sent: personalizedMessage,
                status: 'sent',
                sent_at: new Date().toISOString()
              });
            } catch (dbError) {
              console.error('Error saving message status to database:', dbError);
            }
          }

          // Send progress update
          event.sender.send('campaign-progress', {
            current: i + 1,
            total: customers.length,
            phone: phone,
            name: fullName,
            status: 'sent',
            successCount,
            failedCount
          });

          // Wait between messages to avoid spam detection (3-5 seconds)
          const delay = 3000 + Math.random() * 2000;
          console.log(`Waiting ${(delay / 1000).toFixed(1)}s before next message...`);
          await new Promise(resolve => setTimeout(resolve, delay));

        } catch (error) {
          const fullName = (customer.full_name && customer.full_name.trim() !== '')
            ? customer.full_name.trim()
            : 'Sir';
          const phone = formatPhoneForWhatsApp(customer.phone);

          // Check if it's an invalid number error
          const isInvalidNumber = error.message.includes('INVALID_NUMBER');

          if (isInvalidNumber) {
            console.error(`\n⚠️ ============ INVALID PHONE NUMBER ============`);
            console.error(`⚠️ Customer: ${fullName}`);
            console.error(`⚠️ Phone: ${phone} (original: ${customer.phone})`);
            console.error(`⚠️ Reason: Number not registered on WhatsApp or invalid format`);
            console.error(`⚠️ ================================================\n`);
          } else {
            console.error(`\n❌ ============ MESSAGE SEND FAILED ============`);
            console.error(`❌ Customer: ${fullName}`);
            console.error(`❌ Phone: ${phone} (original: ${customer.phone})`);
            console.error(`❌ Error Type: ${error.name}`);
            console.error(`❌ Error Message: ${error.message}`);
            console.error(`❌ Full Error:`, error);
            console.error(`❌ ============================================\n`);
          }

          failedCount++;

          // Save failed message status to database
          if (dbCampaignId) {
            try {
              // Personalize message for failed attempt
              let personalizedMessage = message;
              personalizedMessage = personalizedMessage.replace(/{full_name}/g, fullName);
              if (customer.phone) {
                personalizedMessage = personalizedMessage.replace(/{phone}/g, customer.phone);
              }

              await supabase.from('message_status').insert({
                campaign_id: dbCampaignId,
                phone_number: phone,
                first_name: fullName,
                last_name: null, // No longer used
                message_sent: personalizedMessage,
                status: 'failed',
                error_message: `${error.name}: ${error.message}`,
                sent_at: new Date().toISOString()
              });
            } catch (dbError) {
              console.error('Error saving failed message status to database:', dbError);
            }
          }

          event.sender.send('campaign-progress', {
            current: i + 1,
            total: customers.length,
            phone: customer.phone,
            name: fullName,
            status: 'failed',
            successCount,
            failedCount,
            error: error.message
          });
        }
      }

      console.log(`\n✅ Campaign completed! Sent: ${successCount}, Failed: ${failedCount}`);

      // Update campaign record with final counts
      if (dbCampaignId) {
        try {
          await supabase
            .from('marketing_campaigns')
            .update({
              sent_count: successCount,
              failed_count: failedCount,
              pending_count: 0,
              status: 'completed',
              updated_at: new Date().toISOString()
            })
            .eq('id', dbCampaignId);
        } catch (dbError) {
          console.error('Error updating campaign record:', dbError);
        }
      }

      return {
        success: true,
        successCount,
        failedCount,
        total: customers.length
      };

    } catch (error) {
      console.error('Campaign error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });
}

function formatPhoneForWhatsApp(phone) {
  let cleaned = phone.replace(/\D/g, '');

  if (cleaned.startsWith('92')) {
    return cleaned;
  } else if (cleaned.startsWith('0')) {
    return '92' + cleaned.substring(1);
  } else if (cleaned.length === 10) {
    return '92' + cleaned;
  }

  return cleaned;
}

module.exports = { registerWhatsAppHandlers };
