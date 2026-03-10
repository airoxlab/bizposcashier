// lib/webOrderNotification.js
import { supabase } from './supabase';
import { notify } from '../components/ui/NotificationSystem';

class WebOrderNotificationManager {
  constructor() {
    this.channel = null;
    this.userId = null;
    this.beepAudio = null;
    this.audioInitialized = false;

    // Initialize audio on first user interaction
    if (typeof window !== 'undefined') {
      const initAudio = () => {
        if (!this.audioInitialized) {
          // Get correct audio path for Electron vs browser
          const audioPath = this.getAudioPath();
          console.log('🔊 [WebOrderNotif] Audio path:', audioPath);

          this.beepAudio = new Audio(audioPath);
          this.beepAudio.volume = 1.0;
          this.beepAudio.load(); // Preload the audio
          this.audioInitialized = true;
          console.log('🔊 [WebOrderNotif] Audio preloaded on user interaction');

          // Remove listeners after first init
          document.removeEventListener('click', initAudio);
          document.removeEventListener('keydown', initAudio);
        }
      };

      // Initialize on first click or keypress
      document.addEventListener('click', initAudio, { once: true });
      document.addEventListener('keydown', initAudio, { once: true });
    }
  }

  // Check if running in Electron
  isElectron() {
    return typeof window !== 'undefined' &&
           window.electronAPI !== undefined;
  }

  // Get correct audio path for Electron vs browser
  getAudioPath() {
    if (this.isElectron()) {
      // Running in Electron
      // In Electron, Next.js serves from app:// protocol or file://
      // The public folder is accessible via the base URL
      const baseUrl = window.location.origin;
      const audioPath = `${baseUrl}/sounds/beep.mp3`;
      console.log('🔊 [WebOrderNotif] Electron detected, using path:', audioPath);
      return audioPath;
    } else {
      // Running in browser - use relative path
      return '/sounds/beep.mp3';
    }
  }

  setUserId(userId) {
    this.userId = userId;
  }

  playBeepSound() {
    try {
      // Ensure audio is initialized
      if (!this.beepAudio) {
        console.warn('⚠️ [WebOrderNotif] Audio not preloaded, initializing now...');
        const audioPath = this.getAudioPath();
        console.log('🔊 [WebOrderNotif] Audio path:', audioPath);
        this.beepAudio = new Audio(audioPath);
        this.beepAudio.volume = 1.0;
        this.beepAudio.load();
      }

      console.log('🔊 [WebOrderNotif] Playing beep sound...');
      console.log('   Audio source:', this.beepAudio.src);
      console.log('   Audio ready state:', this.beepAudio.readyState);
      console.log('   Audio volume:', this.beepAudio.volume);

      this.beepAudio.currentTime = 0; // Reset to start

      // Try to play
      const playPromise = this.beepAudio.play();

      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('✅ [WebOrderNotif] Beep played successfully');
          })
          .catch((err) => {
            console.error('❌ [WebOrderNotif] Could not play sound:', err);
            console.error('   Error name:', err.name);
            console.error('   Error message:', err.message);
            console.error('   Audio src:', this.beepAudio.src);
            console.error('   Audio networkState:', this.beepAudio.networkState);
            console.error('   Audio error:', this.beepAudio.error);

            // If autoplay was blocked, show a notification to user
            if (err.name === 'NotAllowedError') {
              console.warn('⚠️ [WebOrderNotif] Autoplay blocked by browser. User interaction required first.');
            } else if (err.name === 'NotSupportedError') {
              console.error('⚠️ [WebOrderNotif] Audio format not supported or file not found');
            }
          });
      }
    } catch (error) {
      console.error('❌ [WebOrderNotif] Error playing beep sound:', error);
      console.error('   Stack:', error.stack);
    }
  }

  async getPendingCount() {
    if (!this.userId) return 0;

    try {
      const { count, error } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', this.userId)
        .in('original_order_source', ['Website', 'Mobile App'])
        .eq('is_approved', false);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error fetching pending web/mobile orders count:', error);
      return 0;
    }
  }

  startListening(onNewOrder, options = {}) {
    if (!this.userId) {
      console.error('❌ [WebOrderNotif] User ID not set for web order notifications');
      return;
    }

    if (this.channel) {
      console.log('⚠️ [WebOrderNotif] Already listening for web/mobile orders');
      return;
    }

    console.log('📡 [WebOrderNotif] Starting to listen for new web/mobile orders');
    console.log('   User ID:', this.userId);
    console.log('   Channel name: global-web-orders');
    console.log('   Filter: user_id=eq.' + this.userId);

    // Store the notification action if provided
    this.notificationAction = options.action || null;

    this.channel = supabase
      .channel('global-web-orders')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `user_id=eq.${this.userId}`,
        },
        (payload) => {
          const timestamp = new Date().toISOString();
          console.log(`🔔 [WebOrderNotif] ${timestamp} - Realtime event received:`, payload);

          // Check if it's a website or mobile app order
          if ((payload.new?.original_order_source === 'Website' || payload.new?.original_order_source === 'Mobile App')
              && payload.new?.is_approved === false) {
            const sourceLabel = payload.new?.original_order_source === 'Mobile App' ? 'Mobile App' : 'Web';
            const sourceEmoji = payload.new?.original_order_source === 'Mobile App' ? '📱' : '🌐';

            console.log(`${sourceEmoji} [WebOrderNotif] ✅ New ${sourceLabel.toLowerCase()} order detected:`, payload.new.order_number);
            console.log('   Order created at:', payload.new.created_at);
            console.log('   Detected at:', timestamp);

            // Play beep sound
            this.playBeepSound();

            // Prepare notification options
            const notificationOptions = {
              duration: 8000, // Show for 8 seconds
              description: 'Click to view and approve'
            };

            // Add action button if provided
            if (this.notificationAction) {
              notificationOptions.action = this.notificationAction;
            }

            // Show toast notification with success style (more prominent)
            notify.success(
              `${sourceEmoji} New ${sourceLabel} Order: ${payload.new.order_number}`,
              notificationOptions
            );
            console.log('📢 [WebOrderNotif] Toast notification triggered');

            // Call callback if provided
            if (onNewOrder) {
              onNewOrder(payload.new);
            }
          } else {
            console.log('ℹ️ [WebOrderNotif] Order event but not a pending web/mobile order:', {
              order_number: payload.new?.order_number,
              original_order_source: payload.new?.original_order_source,
              is_approved: payload.new?.is_approved
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 [WebOrderNotif] Subscription status:', status);
      });

    console.log('✅ [WebOrderNotif] Subscription setup complete');
  }

  stopListening() {
    if (this.channel) {
      console.log('📡 [WebOrderNotif] Stopping web/mobile order notifications');
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }
}

export const webOrderNotificationManager = new WebOrderNotificationManager();
