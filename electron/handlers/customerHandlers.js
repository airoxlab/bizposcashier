const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gmmjefeojrpazhacqihk.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtbWplZmVvanJwYXpoYWNxaWhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0OTIzOTcsImV4cCI6MjA3MDA2ODM5N30.3lu4RPAt3z1Ux-qRtqqNLeCAcf8tAU4aywHIjfEA3JE';
const supabase = createClient(supabaseUrl, supabaseKey);

function registerCustomerHandlers(ipcMain) {
  ipcMain.handle('customer-find-by-phone', async (event, { phone, user_id }) => {
    try {
      console.log('[Electron] Looking up customer:', phone, 'for user:', user_id);
      
      let { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', phone)
        .eq('user_id', user_id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('[Electron] Supabase error:', error);
        return {
          success: false,
          error: error.message
        };
      }

      if (data) {
        console.log('[Electron] Customer found:', data);
        return {
          success: true,
          customer: data
        };
      } else {
        console.log('[Electron] Customer not found for phone:', phone);
        return {
          success: true,
          customer: null
        };
      }
    } catch (error) {
      console.error('[Electron] Exception in customer-find-by-phone:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle('customer-create', async (event, customerData) => {
    try {
      console.log('[Electron] Creating customer:', customerData);
      
      const { data, error } = await supabase
        .from('customers')
        .insert([{
          user_id: customerData.user_id,
          phone: customerData.phone,
          full_name: customerData.full_name,
          email: customerData.email || null,
          addressline: customerData.addressline || null
        }])
        .select()
        .single();

      if (error) {
        console.error('[Electron] Error creating customer:', error);
        return {
          success: false,
          error: error.message
        };
      }

      console.log('[Electron] Customer created successfully:', data);
      return {
        success: true,
        customer: data
      };
    } catch (error) {
      console.error('[Electron] Exception in customer-create:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle('customer-update', async (event, customerData) => {
    try {
      console.log('[Electron] Updating customer:', customerData);
      
      const { data, error } = await supabase
        .from('customers')
        .update({
          full_name: customerData.full_name,
          email: customerData.email || null,
          addressline: customerData.addressline || null
        })
        .eq('id', customerData.id)
        .eq('user_id', customerData.user_id)
        .select()
        .single();

      if (error) {
        console.error('[Electron] Error updating customer:', error);
        return {
          success: false,
          error: error.message
        };
      }

      console.log('[Electron] Customer updated successfully:', data);
      return {
        success: true,
        customer: data
      };
    } catch (error) {
      console.error('[Electron] Exception in customer-update:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });
}

module.exports = { registerCustomerHandlers };