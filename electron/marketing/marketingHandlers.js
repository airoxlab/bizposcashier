const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gmmjefeojrpazhacqihk.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtbWplZmVvanJwYXpoYWNxaWhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0OTIzOTcsImV4cCI6MjA3MDA2ODM5N30.3lu4RPAt3z1Ux-qRtqqNLeCAcf8tAU4aywHIjfEA3JE';
const supabase = createClient(supabaseUrl, supabaseKey);

function registerMarketingHandlers(ipcMain) {
  ipcMain.handle('upload-campaign-media', async (event, { fileName, fileData }) => {
    try {
      const mediaDir = path.join(app.getPath('userData'), 'campaign-media');
      
      if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
      }

      const filePath = path.join(mediaDir, fileName);

      // fileData is already base64 (split in frontend)
      const buffer = Buffer.from(fileData, 'base64');
      fs.writeFileSync(filePath, buffer);

      console.log('Media file saved:', filePath);

      return {
        success: true,
        filePath: filePath
      };
    } catch (error) {
      console.error('Error uploading media:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle('marketing-get-campaigns', async (event, userEmail) => {
    try {
      const { data, error } = await supabase
        .from('marketing_campaigns')
        .select('*')
        .eq('user_email', userEmail)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return {
        success: true,
        campaigns: data || []
      };
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      return {
        success: false,
        error: error.message,
        campaigns: []
      };
    }
  });

  ipcMain.handle('marketing-get-message-statuses', async (event, campaignId) => {
    try {
      const { data, error } = await supabase
        .from('message_status')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('sent_at', { ascending: false });

      if (error) throw error;

      return {
        success: true,
        statuses: data || []
      };
    } catch (error) {
      console.error('Error fetching message statuses:', error);
      return {
        success: false,
        error: error.message,
        statuses: []
      };
    }
  });

  ipcMain.handle('marketing-get-customers', async (event, userId) => {
    try {
      console.log('[Marketing] Fetching customers for user:', userId);
      
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, phone, email')
        .eq('user_id', userId)
        .order('full_name', { ascending: true });

      if (error) throw error;

      console.log(`[Marketing] Found ${data?.length || 0} customers`);

      return {
        success: true,
        customers: data || []
      };
    } catch (error) {
      console.error('[Marketing] Error fetching customers:', error);
      return {
        success: false,
        error: error.message,
        customers: []
      };
    }
  });
}

module.exports = { registerMarketingHandlers };