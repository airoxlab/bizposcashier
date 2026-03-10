import { supabase } from './supabaseClient'

class ProfileManager {
  constructor() {
    this.storageKey = 'user_profile'
    this.bucketName = 'store-logos'
    this.logoStorageKey = 'store_logo_local'
    this.qrStorageKey = 'qr_code_local'
  }

  // Get current user email from localStorage (user data)
  getCurrentUserEmail() {
    try {
      // First try from 'user' localStorage
      const userData = localStorage.getItem('user')
      if (userData) {
        try {
          const user = JSON.parse(userData)
          if (user.email) {
            console.log('📧 Got user email from user localStorage:', user.email)
            return user.email
          }
        } catch (parseError) {
          console.warn('⚠️ Invalid JSON in user localStorage:', parseError)
        }
      }

      // Try from user_profile localStorage
      const userProfileData = localStorage.getItem('user_profile')
      if (userProfileData) {
        try {
          const userProfile = JSON.parse(userProfileData)
          if (userProfile.email) {
            console.log('📧 Got user email from user_profile localStorage:', userProfile.email)
            return userProfile.email
          }
        } catch (parseError) {
          console.warn('⚠️ Invalid JSON in user_profile localStorage:', parseError)
        }
      }

      console.error('❌ No user email found in localStorage')
      return null
    } catch (error) {
      console.error('❌ Error getting current user email:', error)
      return null
    }
  }

  // Get current user ID from localStorage
  getCurrentUserId() {
    try {
      const userData = localStorage.getItem('user')
      if (userData) {
        try {
          const user = JSON.parse(userData)
          return user.id
        } catch (parseError) {
          console.warn('⚠️ Invalid JSON in user data for ID:', parseError)
        }
      }
      return null
    } catch (error) {
      console.error('❌ Error getting user ID:', error)
      return null
    }
  }

  // Get profile data from localStorage
  getLocalProfile() {
    if (typeof window === 'undefined') return null
    try {
      const savedProfile = localStorage.getItem(this.storageKey)
      return savedProfile ? JSON.parse(savedProfile) : null
    } catch (error) {
      console.error('❌ Error loading local profile:', error)
      return null
    }
  }

  // Save profile data to localStorage (both user and user_profile)
  saveLocalProfile(profileData) {
    try {
      // Save to user_profile
      localStorage.setItem(this.storageKey, JSON.stringify(profileData))
      
      // Also update user localStorage if it exists
      const existingUser = localStorage.getItem('user')
      if (existingUser) {
        try {
          const userData = JSON.parse(existingUser)
          const updatedUserData = {
            ...userData,
            phone: profileData.phone,
            store_address: profileData.store_address,
            store_logo: profileData.store_logo,
            qr_code: profileData.qr_code,
            invoice_status: profileData.invoice_status,
            hashtag1: profileData.hashtag1,
            hashtag2: profileData.hashtag2,
            show_footer_section: profileData.show_footer_section,
            show_logo_on_receipt: profileData.show_logo_on_receipt,
            show_business_name_on_receipt: profileData.show_business_name_on_receipt,
            business_start_time: profileData.business_start_time,
            business_end_time: profileData.business_end_time
          }
          localStorage.setItem('user', JSON.stringify(updatedUserData))
          console.log('✅ Both user and user_profile localStorage updated')
        } catch (e) {
          console.warn('⚠️ Could not update user localStorage:', e)
        }
      }
      
      return true
    } catch (error) {
      console.error('❌ Error saving local profile:', error)
      return false
    }
  }

  // Save logo locally for receipts (as base64)
  async saveLogoLocally(logoUrl) {
    try {
      if (!logoUrl) return null

      // If it's already base64, save directly
      if (logoUrl.startsWith('data:image/')) {
        localStorage.setItem(this.logoStorageKey, logoUrl)
        console.log('✅ Logo saved locally (base64)')
        return logoUrl
      }

      // If it's a URL, fetch and convert to base64
      const response = await fetch(logoUrl)
      const blob = await response.blob()
      
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          const base64 = reader.result
          localStorage.setItem(this.logoStorageKey, base64)
          console.log('✅ Logo fetched and saved locally (base64)')
          resolve(base64)
        }
        reader.readAsDataURL(blob)
      })
    } catch (error) {
      console.error('❌ Error saving logo locally:', error)
      return null
    }
  }

  // Get local logo for receipts
  getLocalLogo() {
    try {
      return localStorage.getItem(this.logoStorageKey)
    } catch (error) {
      console.error('❌ Error getting local logo:', error)
      return null
    }
  }

  // Save QR code locally for receipts (as URL, not base64)
  async saveQrLocally(qrUrl) {
    try {
      if (!qrUrl) return null

      // Store URL directly for QR codes
      localStorage.setItem(this.qrStorageKey, qrUrl)
      console.log('✅ QR code URL saved locally:', qrUrl)
      return qrUrl
    } catch (error) {
      console.error('❌ Error saving QR code locally:', error)
      return null
    }
  }

  // Get local QR code for receipts
  getLocalQr() {
    try {
      return localStorage.getItem(this.qrStorageKey)
    } catch (error) {
      console.error('❌ Error getting local QR code:', error)
      return null
    }
  }

  // Fetch complete profile from Supabase using email
  async fetchProfileFromDatabase() {
    try {
      const userEmail = this.getCurrentUserEmail()
      if (!userEmail) {
        throw new Error('No user email found in localStorage')
      }

      console.log('🔄 Fetching profile from database for email:', userEmail)

      const { data, error } = await supabase
        .from('users')
        .select('id, customer_name, email, store_name, phone, store_address, store_logo, qr_code, invoice_status, hashtag1, hashtag2, show_footer_section, show_logo_on_receipt, show_business_name_on_receipt')
        .eq('email', userEmail)
        .single()

      if (error) {
        console.error('❌ Supabase error:', error)
        throw error
      }

      if (!data) {
        throw new Error('No user data found for email: ' + userEmail)
      }

      const profileData = {
        id: data.id,
        customer_name: data.customer_name || '',
        email: data.email || '',
        store_name: data.store_name || '',
        phone: data.phone || '',
        store_address: data.store_address || '',
        store_logo: data.store_logo || '',
        qr_code: data.qr_code || '',
        invoice_status: data.invoice_status || 'unpaid',
        hashtag1: data.hashtag1 || '',
        hashtag2: data.hashtag2 || '',
        show_footer_section: data.show_footer_section === false ? false : true, // Default true if null/undefined
        show_logo_on_receipt: data.show_logo_on_receipt === false ? false : true // Default true if null/undefined
      }

      // Save to localStorage
      this.saveLocalProfile(profileData)
      
      // Save logo locally for receipts
      if (profileData.store_logo) {
        await this.saveLogoLocally(profileData.store_logo)
      }

      // Save QR code locally for receipts
      if (profileData.qr_code) {
        await this.saveQrLocally(profileData.qr_code)
      }

      console.log('✅ Profile fetched and saved locally:', profileData)
      return profileData
    } catch (error) {
      console.error('❌ Error fetching profile from database:', error)
      // Return local data as fallback
      const localData = this.getLocalProfile()
      console.log('📱 Falling back to local data:', localData)
      return localData
    }
  }

  // Upload logo to Supabase Storage
  async uploadLogo(file) {
    try {
      const userEmail = this.getCurrentUserEmail()
      if (!userEmail) {
        throw new Error('No user email found')
      }

      console.log('📤 Uploading logo for user:', userEmail)

      const timestamp = Date.now()
      const fileExtension = file.name.split('.').pop()
      const fileName = `logos/${userEmail.replace('@', '_').replace('.', '_')}_${timestamp}.${fileExtension}`

      console.log('📁 Upload path:', fileName)

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(this.bucketName)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        })

      if (uploadError) {
        console.error('❌ Upload error:', uploadError)
        throw uploadError
      }

      console.log('✅ File uploaded successfully:', uploadData)

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(this.bucketName)
        .getPublicUrl(fileName)

      // Verify the URL format
      if (!publicUrl || !publicUrl.includes('supabase')) {
        throw new Error('Invalid public URL generated')
      }

      console.log('🔗 Public URL generated:', publicUrl)
      
      // Save logo locally for receipts (fetch from URL and convert to base64)
      try {
        await this.saveLogoLocally(publicUrl)
        console.log('📱 Logo also saved locally for receipts')
      } catch (localSaveError) {
        console.warn('⚠️ Could not save logo locally for receipts:', localSaveError)
      }
      
      return { success: true, url: publicUrl }
    } catch (error) {
      console.error('❌ Error uploading logo:', error)
      return { success: false, error: error.message }
    }
  }

  // Upload QR code to Supabase Storage
  async uploadQrCode(file) {
    try {
      const userEmail = this.getCurrentUserEmail()
      if (!userEmail) {
        throw new Error('No user email found')
      }

      console.log('📤 Uploading QR code for user:', userEmail)

      const timestamp = Date.now()
      const fileExtension = file.name.split('.').pop()
      const fileName = `qr-codes/${userEmail.replace('@', '_').replace('.', '_')}_${timestamp}.${fileExtension}`

      console.log('📁 QR Upload path:', fileName)

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(this.bucketName)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        })

      if (uploadError) {
        console.error('❌ QR Upload error:', uploadError)
        throw uploadError
      }

      console.log('✅ QR File uploaded successfully:', uploadData)

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(this.bucketName)
        .getPublicUrl(fileName)

      // Verify the URL format
      if (!publicUrl || !publicUrl.includes('supabase')) {
        throw new Error('Invalid QR public URL generated')
      }

      console.log('🔗 QR Public URL generated:', publicUrl)
      
      // Save QR code URL locally for receipts
      try {
        await this.saveQrLocally(publicUrl)
        console.log('📱 QR code URL also saved locally for receipts')
      } catch (localSaveError) {
        console.warn('⚠️ Could not save QR code locally for receipts:', localSaveError)
      }
      
      return { success: true, url: publicUrl }
    } catch (error) {
      console.error('❌ Error uploading QR code:', error)
      return { success: false, error: error.message }
    }
  }

  // Delete old logo from storage
  async deleteOldLogo(logoUrl) {
    try {
      if (!logoUrl || !logoUrl.includes(this.bucketName)) {
        console.log('📝 No valid logo URL to delete')
        return
      }

      const urlParts = logoUrl.split(`${this.bucketName}/`)
      if (urlParts.length < 2) return

      const filePath = urlParts[1]

      const { error } = await supabase.storage
        .from(this.bucketName)
        .remove([filePath])

      if (error) {
        console.warn('⚠️ Error deleting old logo:', error)
      } else {
        console.log('🗑️ Old logo deleted successfully')
      }
    } catch (error) {
      console.warn('⚠️ Error deleting old logo:', error)
    }
  }

  // Delete old QR code from storage
  async deleteOldQrCode(qrUrl) {
    try {
      if (!qrUrl || !qrUrl.includes(this.bucketName)) {
        console.log('📝 No valid QR URL to delete')
        return
      }

      const urlParts = qrUrl.split(`${this.bucketName}/`)
      if (urlParts.length < 2) return

      const filePath = urlParts[1]

      const { error } = await supabase.storage
        .from(this.bucketName)
        .remove([filePath])

      if (error) {
        console.warn('⚠️ Error deleting old QR code:', error)
      } else {
        console.log('🗑️ Old QR code deleted successfully')
      }
    } catch (error) {
      console.warn('⚠️ Error deleting old QR code:', error)
    }
  }

  // Update profile in Supabase database
  async updateProfileInDatabase(profileData) {
    try {
      const userEmail = this.getCurrentUserEmail()
      if (!userEmail) {
        throw new Error('No user email found')
      }

      console.log('💾 Updating profile in database for email:', userEmail)
      console.log('📝 Profile data to update:', profileData)

      // Prepare update data - ensure logo and QR are URLs, not base64
      const updateData = {
        phone: profileData.phone || null,
        store_address: profileData.store_address || null,
        hashtag1: profileData.hashtag1 !== undefined ? profileData.hashtag1 : null,
        hashtag2: profileData.hashtag2 !== undefined ? profileData.hashtag2 : null,
        show_footer_section: profileData.show_footer_section === false ? false : true, // Default true if null/undefined
        show_logo_on_receipt: profileData.show_logo_on_receipt === false ? false : true, // Default true if null/undefined
        show_business_name_on_receipt: profileData.show_business_name_on_receipt === false ? false : true, // Default true if null/undefined
        business_start_time: profileData.business_start_time || '10:00',
        business_end_time: profileData.business_end_time || '03:00',
        updated_at: new Date().toISOString()
      }

      console.log('📝 Hashtag values being saved:')
      console.log('  - hashtag1:', profileData.hashtag1, '(will save as:', updateData.hashtag1, ')')
      console.log('  - hashtag2:', profileData.hashtag2, '(will save as:', updateData.hashtag2, ')')
      console.log('  - show_footer_section:', profileData.show_footer_section, '(will save as:', updateData.show_footer_section, ')')
      console.log('  - show_logo_on_receipt:', profileData.show_logo_on_receipt, '(will save as:', updateData.show_logo_on_receipt, ')')
      console.log('  - show_business_name_on_receipt:', profileData.show_business_name_on_receipt, '(will save as:', updateData.show_business_name_on_receipt, ')')

      // Handle logo URL specifically
      if (profileData.store_logo) {
        if (profileData.store_logo.startsWith('data:')) {
          // This is base64, don't save to database
          console.warn('⚠️ Received base64 logo data, skipping database save for logo')
          console.log('📝 Logo will not be updated in database (base64 data)')
        } else {
          // This is a URL, save to database
          updateData.store_logo = profileData.store_logo
          console.log('🔗 Logo URL will be saved to database:', updateData.store_logo)
        }
      } else if (profileData.store_logo === null || profileData.store_logo === '') {
        // Explicitly setting logo to null/empty
        updateData.store_logo = null
        console.log('🗑️ Logo will be cleared from database')
      }

      // Handle QR code URL specifically
      if (profileData.qr_code) {
        if (profileData.qr_code.startsWith('data:')) {
          // This is base64, don't save to database
          console.warn('⚠️ Received base64 QR data, skipping database save for QR code')
          console.log('📝 QR code will not be updated in database (base64 data)')
        } else {
          // This is a URL, save to database
          updateData.qr_code = profileData.qr_code
          console.log('🔗 QR code URL will be saved to database:', updateData.qr_code)
        }
      } else if (profileData.qr_code === null || profileData.qr_code === '') {
        // Explicitly setting QR code to null/empty
        updateData.qr_code = null
        console.log('🗑️ QR code will be cleared from database')
      }

      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key]
        }
      })

      console.log('🔄 Sending update to database:', updateData)

      const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('email', userEmail)
        .select('id, customer_name, email, store_name, phone, store_address, store_logo, qr_code, invoice_status, hashtag1, hashtag2, show_footer_section, show_logo_on_receipt, show_business_name_on_receipt, business_start_time, business_end_time')
        .single()

      if (error) {
        console.error('❌ Database update error:', error)
        throw error
      }

      console.log('✅ Profile updated in database successfully:', data)
      
      // Verify the logo was saved correctly
      if (updateData.store_logo && data.store_logo !== updateData.store_logo) {
        console.error('❌ Logo URL mismatch! Expected:', updateData.store_logo, 'Got:', data.store_logo)
      } else if (updateData.store_logo) {
        console.log('✅ Logo URL verified in database:', data.store_logo)
      }

      // Verify the QR code was saved correctly
      if (updateData.qr_code && data.qr_code !== updateData.qr_code) {
        console.error('❌ QR code URL mismatch! Expected:', updateData.qr_code, 'Got:', data.qr_code)
      } else if (updateData.qr_code) {
        console.log('✅ QR code URL verified in database:', data.qr_code)
      }
      
      return data
    } catch (error) {
      console.error('❌ Error updating profile in database:', error)
      throw error
    }
  }

  // Complete profile update flow
  async updateProfile(profileData, newLogoFile = null, newQrFile = null) {
    try {
      let updatedProfile = { ...profileData }
      let logoLocalData = null
      let qrLocalData = null
      let supabaseLogoUrl = null
      let supabaseQrUrl = null

      console.log('🔄 Starting profile update process...')
      console.log('📋 Input profile data:', profileData)
      console.log('🖼️ New logo file:', newLogoFile ? newLogoFile.name : 'None')
      console.log('🔲 New QR file:', newQrFile ? newQrFile.name : 'None')

      // Validate profile data
      if (profileData.store_address && !this.validateAddress(profileData.store_address)) {
        throw new Error('Address is too long (max 500 characters)')
      }

      // Handle logo upload if new file provided
      if (newLogoFile) {
        console.log('📤 Processing logo upload...')
        
        // Validate image file
        const { isValid, errors } = await this.validateImageFile(newLogoFile)
        if (!isValid) {
          throw new Error(`Invalid logo: ${errors.join(', ')}`)
        }

        // Convert to base64 for localStorage backup
        try {
          const reader = new FileReader()
          logoLocalData = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result)
            reader.readAsDataURL(newLogoFile)
          })
          console.log('📝 Logo converted to base64 for localStorage')
          
          // Save logo locally immediately for receipts
          localStorage.setItem(this.logoStorageKey, logoLocalData)
        } catch (error) {
          console.warn('⚠️ Error converting logo to base64:', error)
        }

        // Delete old logo if exists
        if (updatedProfile.store_logo && updatedProfile.store_logo.includes(this.bucketName)) {
          await this.deleteOldLogo(updatedProfile.store_logo)
        }

        // Upload new logo to Supabase Storage
        const uploadResult = await this.uploadLogo(newLogoFile)
        
        if (uploadResult.success) {
          supabaseLogoUrl = uploadResult.url
          // Use Supabase URL for database storage, NOT base64
          updatedProfile.store_logo = supabaseLogoUrl
          console.log('✅ Logo uploaded to Supabase, will save URL to database:', supabaseLogoUrl)
        } else {
          console.error('❌ Logo upload to Supabase failed:', uploadResult.error)
          throw new Error(`Failed to upload logo: ${uploadResult.error}`)
        }
      }

      // Handle QR code upload if new file provided
      if (newQrFile) {
        console.log('📤 Processing QR code upload...')
        
        // Validate image file
        const { isValid, errors } = await this.validateImageFile(newQrFile)
        if (!isValid) {
          throw new Error(`Invalid QR code: ${errors.join(', ')}`)
        }

        // Delete old QR code if exists
        if (updatedProfile.qr_code && updatedProfile.qr_code.includes(this.bucketName)) {
          await this.deleteOldQrCode(updatedProfile.qr_code)
        }

        // Upload new QR code to Supabase Storage
        const uploadResult = await this.uploadQrCode(newQrFile)
        
        if (uploadResult.success) {
          supabaseQrUrl = uploadResult.url
          // Use Supabase URL for database storage
          updatedProfile.qr_code = supabaseQrUrl
          console.log('✅ QR code uploaded to Supabase, will save URL to database:', supabaseQrUrl)
        } else {
          console.error('❌ QR code upload to Supabase failed:', uploadResult.error)
          throw new Error(`Failed to upload QR code: ${uploadResult.error}`)
        }
      }

      // Update database with Supabase URLs (not base64)
      console.log('💾 Updating database with profile data...')
      console.log('🔗 Logo URL for database:', updatedProfile.store_logo)
      console.log('🔗 QR URL for database:', updatedProfile.qr_code)
      
      const databaseResult = await this.updateProfileInDatabase(updatedProfile)
      
      // Merge database result with our data
      const finalProfile = {
        id: databaseResult.id,
        customer_name: databaseResult.customer_name,
        email: databaseResult.email,
        store_name: databaseResult.store_name,
        phone: databaseResult.phone,
        store_address: databaseResult.store_address,
        store_logo: databaseResult.store_logo, // This should be the Supabase URL
        qr_code: databaseResult.qr_code, // This should be the Supabase URL
        invoice_status: databaseResult.invoice_status,
        hashtag1: databaseResult.hashtag1 || '',
        hashtag2: databaseResult.hashtag2 || '',
        show_footer_section: databaseResult.show_footer_section === false ? false : true,
        show_logo_on_receipt: databaseResult.show_logo_on_receipt === false ? false : true,
        show_business_name_on_receipt: databaseResult.show_business_name_on_receipt === false ? false : true,
        business_start_time: databaseResult.business_start_time || '10:00',
        business_end_time: databaseResult.business_end_time || '03:00'
      }

      console.log('✅ Database updated with logo URL:', finalProfile.store_logo)
      console.log('✅ Database updated with QR URL:', finalProfile.qr_code)
      console.log('✅ Database updated with hashtag1:', finalProfile.hashtag1)
      console.log('✅ Database updated with hashtag2:', finalProfile.hashtag2)
      console.log('✅ Database updated with show_footer_section:', finalProfile.show_footer_section)
      console.log('✅ Database updated with show_logo_on_receipt:', finalProfile.show_logo_on_receipt)
      console.log('✅ Database updated with show_business_name_on_receipt:', finalProfile.show_business_name_on_receipt)

      // Save profile to localStorage (with Supabase URLs)
      this.saveLocalProfile(finalProfile)

      // Ensure base64 version is saved locally for logo receipts
      if (logoLocalData) {
        localStorage.setItem(this.logoStorageKey, logoLocalData)
        console.log('📱 Base64 logo saved locally for receipts')
      } else if (finalProfile.store_logo && !finalProfile.store_logo.startsWith('data:')) {
        // If we have a URL but no base64, fetch and convert for receipts
        await this.saveLogoLocally(finalProfile.store_logo)
      }

      // Ensure QR URL is saved locally for receipts
      if (finalProfile.qr_code) {
        await this.saveQrLocally(finalProfile.qr_code)
        console.log('📱 QR code URL saved locally for receipts')
      }

      console.log('✅ Profile update completed successfully')
      return { success: true, data: finalProfile }

    } catch (error) {
      console.error('❌ Error in complete profile update:', error)
      
      // Save locally as fallback (with base64 if available)
      try {
        if (logoLocalData) {
          // Use base64 for local fallback
          updatedProfile.store_logo = logoLocalData
          localStorage.setItem(this.logoStorageKey, logoLocalData)
        }
        if (qrLocalData) {
          // Use URL for local fallback
          updatedProfile.qr_code = qrLocalData
          localStorage.setItem(this.qrStorageKey, qrLocalData)
        }
        this.saveLocalProfile(updatedProfile)
        console.log('📱 Profile saved locally as fallback')
      } catch (localError) {
        console.error('❌ Failed to save locally:', localError)
      }

      return { success: false, error: error.message, data: updatedProfile }
    }
  }

  // Initialize profile data
  async initializeProfile() {
    try {
      console.log('🔄 Initializing profile data...')
      
      // Try to get from database first
      const databaseProfile = await this.fetchProfileFromDatabase()
      console.log('🗄️ Database profile:', databaseProfile)

      if (databaseProfile && (databaseProfile.customer_name || databaseProfile.email)) {
        return databaseProfile
      }

      // Fallback to local profile
      const localProfile = this.getLocalProfile()
      console.log('📱 Local profile fallback:', localProfile)
      return localProfile

    } catch (error) {
      console.error('❌ Error initializing profile:', error)
      const fallbackProfile = this.getLocalProfile()
      console.log('🔄 Using fallback profile:', fallbackProfile)
      return fallbackProfile
    }
  }

  // Validate image file
  async validateImageFile(file) {
    const errors = []
    
    if (!file.type.startsWith('image/')) {
      errors.push('Please select a valid image file')
    }
    
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      errors.push('Image size should be less than 5MB')
    }
    
    return new Promise((resolve) => {
      if (errors.length > 0) {
        resolve({ isValid: false, errors })
        return
      }
      
      const img = new Image()
      img.onload = () => {
        if (img.width < 50 || img.height < 50) {
          errors.push('Image should be at least 50x50 pixels')
        }
        if (img.width > 2000 || img.height > 2000) {
          errors.push('Image should not exceed 2000x2000 pixels')
        }
        resolve({ 
          isValid: errors.length === 0, 
          errors,
          dimensions: { width: img.width, height: img.height }
        })
      }
      img.onerror = () => {
        resolve({ isValid: false, errors: ['Invalid image file'] })
      }
      img.src = URL.createObjectURL(file)
    })
  }

  // Validate address
  validateAddress(address) {
    if (!address) return true
    return address.length <= 500
  }

  // Force refresh profile from database
  async refreshProfileFromDatabase() {
    try {
      console.log('🔄 Force refreshing profile from database...')
      const profile = await this.fetchProfileFromDatabase()
      return profile
    } catch (error) {
      console.error('❌ Error refreshing profile:', error)
      return this.getLocalProfile()
    }
  }

  // Sync local data to database (for offline-to-online sync)
  async syncLocalToDatabase() {
    try {
      const localProfile = this.getLocalProfile()
      if (!localProfile) {
        console.log('📱 No local profile to sync')
        return { success: true }
      }

      console.log('🔄 Syncing local profile to database...')
      const result = await this.updateProfile(localProfile)
      
      if (result.success) {
        console.log('✅ Local profile synced to database successfully')
      } else {
        console.error('❌ Failed to sync local profile:', result.error)
      }

      return result
    } catch (error) {
      console.error('❌ Error syncing local to database:', error)
      return { success: false, error: error.message }
    }
  }

  // Get profile data for receipts (includes local logo and QR)
  getProfileForReceipt() {
    try {
      const profile = this.getLocalProfile()
      const localLogo = this.getLocalLogo()
      const localQr = this.getLocalQr()
      
      return {
        ...profile,
        store_logo_local: localLogo, // Local base64 logo for receipts
        qr_code_local: localQr // Local QR URL for receipts
      }
    } catch (error) {
      console.error('❌ Error getting profile for receipt:', error)
      return null
    }
  }
}

export const profileManager = new ProfileManager()