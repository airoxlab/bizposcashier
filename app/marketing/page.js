'use client'

import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Send, Search, CheckCircle, XCircle,
  AlertCircle, Users, Upload, Loader, X, Moon, Sun,
  MessageSquare, TrendingUp, Target, Phone
} from 'lucide-react';
import ProtectedPage from '../../components/ProtectedPage';

export default function MarketingPage() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('create');
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [campaignName, setCampaignName] = useState('');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPath, setMediaPath] = useState('');

  const [customers, setCustomers] = useState([]);
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [messageStatuses, setMessageStatuses] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');

  const [sendingProgress, setSendingProgress] = useState({ current: 0, total: 0, phone: '', name: '' });
  const [showProgressModal, setShowProgressModal] = useState(false);

  const [notifications, setNotifications] = useState([]);

  const showNotification = (message, type = 'info') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const availableTags = [
    { name: '{full_name}', desc: 'Customer name' },
    { name: '{phone}', desc: 'Phone number' }
  ];

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) setUser(JSON.parse(userData));

    loadCustomers();
    loadCampaigns();

    if (window.electron?.whatsapp) {
      window.electron.whatsapp.onProgress((data) => setSendingProgress(data));
    }

    checkWhatsAppConnection();
    const connectionInterval = setInterval(checkWhatsAppConnection, 5000);

    return () => clearInterval(connectionInterval);
  }, []);

  const checkWhatsAppConnection = async () => {
    try {
      const result = await window.electron.whatsapp.checkConnection();
      setWhatsappConnected(result.isConnected);
      localStorage.setItem('whatsapp_connected', result.isConnected.toString());
    } catch (error) {
      setWhatsappConnected(false);
    }
  };

  const loadCustomers = async () => {
    try {
      const userData = localStorage.getItem('user');
      if (!userData) return;
      const currentUser = JSON.parse(userData);
      const result = await window.electron.marketing.getCustomers(currentUser.id);
      if (result.success) {
        const uniqueCustomers = [];
        const seenPhones = new Set();
        for (const customer of result.customers) {
          if (!seenPhones.has(customer.phone)) {
            seenPhones.add(customer.phone);
            uniqueCustomers.push(customer);
          }
        }
        setCustomers(uniqueCustomers);
      }
    } catch (error) {
      showNotification('Failed to load customers', 'error');
    }
  };

  const loadCampaigns = async () => {
    try {
      const userData = localStorage.getItem('user');
      if (!userData) return;
      const currentUser = JSON.parse(userData);
      const result = await window.electron.marketing.getCampaigns(currentUser.email || 'demo@example.com');
      if (result.success) {
        setCampaigns(result.campaigns);
        if (result.campaigns.length > 0 && !selectedCampaign) {
          handleLoadCampaignDetails(result.campaigns[0]);
        }
      }
    } catch (error) {
      console.error('Error loading campaigns:', error);
    }
  };

  const handleConnectWhatsApp = async () => {
    setIsConnecting(true);
    showNotification('Opening WhatsApp Web...', 'info');
    try {
      const result = await window.electron.whatsapp.connect();
      if (result.success) {
        showNotification('Scan QR code to connect', 'info');
        const checkInterval = setInterval(async () => {
          try {
            const checkResult = await window.electron.whatsapp.checkConnection();
            if (checkResult.isConnected) {
              setWhatsappConnected(true);
              setIsConnecting(false);
              localStorage.setItem('whatsapp_connected', 'true');
              showNotification('WhatsApp connected!', 'success');
              clearInterval(checkInterval);
            }
          } catch (error) {
            console.error('Check error:', error);
          }
        }, 3000);
        setTimeout(() => {
          clearInterval(checkInterval);
          if (isConnecting) {
            setIsConnecting(false);
            showNotification('Connection timeout', 'error');
          }
        }, 120000);
      } else {
        setIsConnecting(false);
        showNotification('Failed: ' + (result.error || result.message || 'Unknown error'), 'error');
      }
    } catch (error) {
      setIsConnecting(false);
      showNotification('Error: ' + error.message, 'error');
    }
  };

  const handleDisconnectWhatsApp = async () => {
    try {
      await window.electron.whatsapp.disconnect();
      setWhatsappConnected(false);
      localStorage.setItem('whatsapp_connected', 'false');
      showNotification('Disconnected', 'info');
    } catch (error) {
      showNotification('Error: ' + error.message, 'error');
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      showNotification('File too large (max 16MB)', 'error');
      return;
    }
    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const base64Data = event.target.result.split(',')[1];
          const ext = file.name.split('.').pop();
          const result = await window.electron.marketing.uploadMedia({
            fileName: `media_${Date.now()}.${ext}`,
            fileData: base64Data
          });
          if (result.success) {
            setMediaFile(file);
            setMediaPath(result.filePath);
            showNotification('File uploaded!', 'success');
          } else {
            showNotification('Upload failed', 'error');
          }
          setIsUploading(false);
        } catch (error) {
          setIsUploading(false);
          showNotification('Upload error', 'error');
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      setIsUploading(false);
      showNotification('File read error', 'error');
    }
  };

  const handleSendCampaign = async () => {
    if (!campaignName.trim()) return showNotification('Enter campaign name', 'error');
    if (!messageTemplate.trim()) return showNotification('Enter message', 'error');
    if (selectedCustomers.length === 0) return showNotification('Select customers', 'error');
    if (!whatsappConnected) return showNotification('Connect WhatsApp first', 'error');
    if (isUploading) return showNotification('File uploading...', 'warning');

    setIsSending(true);
    setShowProgressModal(true);
    setSendingProgress({ current: 0, total: selectedCustomers.length, phone: '', name: '' });

    try {
      const recipients = customers.filter(c => selectedCustomers.includes(c.id));
      const userData = localStorage.getItem('user');
      const currentUser = JSON.parse(userData);
      const result = await window.electron.whatsapp.sendCampaign({
        campaignId: campaignName,
        customers: recipients,
        message: messageTemplate,
        mediaPath,
        userEmail: currentUser?.email || 'demo@example.com'
      });
      if (result.success) {
        showNotification(`Sent: ${result.successCount}, Failed: ${result.failedCount}`, 'success');
        loadCampaigns();
        setCampaignName('');
        setMessageTemplate('');
        setMediaPath('');
        setMediaFile(null);
        setSelectedCustomers([]);
      } else {
        showNotification('Campaign failed', 'error');
      }
    } catch (error) {
      showNotification('Error: ' + error.message, 'error');
    } finally {
      setIsSending(false);
      setShowProgressModal(false);
    }
  };

  const handleLoadCampaignDetails = async (campaign) => {
    setSelectedCampaign(campaign);
    try {
      const result = await window.electron.marketing.getMessageStatuses(campaign.id);
      if (result.success) setMessageStatuses(result.statuses);
    } catch (error) {
      showNotification('Error loading statuses', 'error');
    }
  };

  const toggleCustomer = (id) => {
    setSelectedCustomers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    const filtered = getFilteredCustomers();
    setSelectedCustomers(prev => prev.length === filtered.length && filtered.length > 0 ? [] : filtered.map(c => c.id));
  };

  const insertTag = (tag) => setMessageTemplate(prev => prev + tag);

  const getFilteredCustomers = () => {
    return customers.filter(c => {
      const search = searchQuery.toLowerCase();
      return c.first_name?.toLowerCase().includes(search) ||
             c.last_name?.toLowerCase().includes(search) ||
             c.phone?.includes(search);
    });
  };

  const getFilteredStatuses = () => {
    if (statusFilter === 'all') return messageStatuses;
    return messageStatuses.filter(s => s.status === statusFilter);
  };

  const formatPhone = (phone) => {
    if (!phone) return '';
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) return '92' + cleaned.substring(1);
    if (!cleaned.startsWith('92')) return '92' + cleaned;
    return cleaned;
  };

  const totalStats = {
    sent: campaigns.reduce((sum, c) => sum + (c.sent_count || 0), 0),
    failed: campaigns.reduce((sum, c) => sum + (c.failed_count || 0), 0)
  };

  const filteredCustomers = getFilteredCustomers();
  const filteredStatuses = getFilteredStatuses();

  const [themeClasses, setThemeClasses] = useState(null);
  const [themeManager, setThemeManager] = useState(null);

  useEffect(() => {
    import('../../lib/themeManager').then(({ default: tm }) => {
      setThemeManager(tm);
      setThemeClasses(tm.getClasses());
    });
  }, []);

  const toggleTheme = () => {
    if (themeManager) {
      const newTheme = themeManager.isDark() ? 'light' : 'dark';
      themeManager.setTheme(newTheme);
      setThemeClasses(themeManager.getClasses());
    }
  };

  if (!themeClasses) return null;
  const isDark = themeClasses.textPrimary.includes('white');

  return (
    <ProtectedPage permissionKey="MARKETING" pageName="Marketing">
      <div className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2 w-80">
        <AnimatePresence>
          {notifications.map(notif => (
            <div
              key={notif.id}
              className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${
                notif.type === 'success' ? 'bg-green-600 text-white' :
                notif.type === 'error' ? 'bg-red-600 text-white' :
                notif.type === 'warning' ? 'bg-orange-600 text-white' :
                'bg-blue-600 text-white'
              }`}>
              {notif.type === 'success' && <CheckCircle className="w-4 h-4" />}
              {notif.type === 'error' && <XCircle className="w-4 h-4" />}
              {notif.type === 'warning' && <AlertCircle className="w-4 h-4" />}
              {notif.type === 'info' && <AlertCircle className="w-4 h-4" />}
              <span className="flex-1 text-sm">{notif.message}</span>
              <button onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))}>
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </AnimatePresence>
      </div>

      {/* Header */}
      <div className={`sticky top-0 z-40 ${isDark ? 'bg-gray-800/95 border-gray-700' : 'bg-white/95 border-gray-200'} border-b backdrop-blur-sm`}>
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => window.location.href = '/dashboard'}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                  isDark
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                } transition-colors`}
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="text-sm font-semibold">Dashboard</span>
              </button>
              <div className={`w-px h-6 ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} />
              <h1 className={`text-xl font-semibold ${themeClasses.textPrimary}`}>WhatsApp Marketing</h1>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={toggleTheme}
                className={`p-2.5 rounded-lg ${
                  isDark
                    ? 'bg-gray-700 hover:bg-gray-600 text-yellow-400'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                } transition-colors`}
                title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              {whatsappConnected ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-sm font-medium">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span>Connected</span>
                  <button onClick={handleDisconnectWhatsApp} className="ml-1 hover:bg-green-100 dark:hover:bg-green-900/40 rounded p-0.5">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleConnectWhatsApp}
                  disabled={isConnecting}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isConnecting ? (
                    <span className="flex items-center gap-2">
                      <Loader className="w-4 h-4 animate-spin" />
                      Connecting...
                    </span>
                  ) : (
                    'Connect WhatsApp'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b`}>
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="grid grid-cols-4 gap-6">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-lg ${isDark ? 'bg-purple-900/30' : 'bg-purple-100'} flex items-center justify-center`}>
                <Target className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className={`text-xs font-medium ${themeClasses.textSecondary} uppercase tracking-wider`}>Total Campaigns</p>
                <p className={`text-2xl font-bold ${themeClasses.textPrimary} mt-0.5`}>{campaigns.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-lg ${isDark ? 'bg-green-900/30' : 'bg-green-100'} flex items-center justify-center`}>
                <MessageSquare className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className={`text-xs font-medium ${themeClasses.textSecondary} uppercase tracking-wider`}>Messages Sent</p>
                <p className={`text-2xl font-bold ${themeClasses.textPrimary} mt-0.5`}>{totalStats.sent}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-lg ${isDark ? 'bg-red-900/30' : 'bg-red-100'} flex items-center justify-center`}>
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <p className={`text-xs font-medium ${themeClasses.textSecondary} uppercase tracking-wider`}>Failed</p>
                <p className={`text-2xl font-bold ${themeClasses.textPrimary} mt-0.5`}>{totalStats.failed}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-lg ${isDark ? 'bg-blue-900/30' : 'bg-blue-100'} flex items-center justify-center`}>
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className={`text-xs font-medium ${themeClasses.textSecondary} uppercase tracking-wider`}>Total Customers</p>
                <p className={`text-2xl font-bold ${themeClasses.textPrimary} mt-0.5`}>{customers.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className={`${isDark ? 'bg-gray-800/50' : 'bg-white/50'} border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1">
            {[
              { id: 'create', name: 'Create Campaign', icon: Send },
              { id: 'history', name: 'Campaign History', icon: TrendingUp },
              { id: 'analytics', name: 'Analytics', icon: Phone }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-all ${
                    activeTab === tab.id
                      ? `border-purple-600 ${themeClasses.textPrimary} ${isDark ? 'bg-gray-800' : 'bg-white'}`
                      : `border-transparent ${themeClasses.textSecondary} hover:${themeClasses.textPrimary} ${isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}`
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{tab.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'create' && (
          <div className="grid grid-cols-12 gap-6">
            {/* Main Form - 8 columns */}
            <div className="col-span-8 space-y-6">
              {!whatsappConnected && (
                <div className={`flex items-start gap-3 p-4 rounded-lg ${isDark ? 'bg-orange-900/20 border border-orange-800/30' : 'bg-orange-50 border border-orange-200'}`}>
                  <AlertCircle className={`w-5 h-5 mt-0.5 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
                  <div>
                    <p className={`text-sm font-medium ${isDark ? 'text-orange-300' : 'text-orange-900'}`}>WhatsApp Not Connected</p>
                    <p className={`text-sm ${isDark ? 'text-orange-400' : 'text-orange-700'} mt-1`}>
                      Connect WhatsApp to send campaigns to your customers.
                    </p>
                  </div>
                </div>
              )}

              <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-6`}>
                <h2 className={`text-lg font-semibold ${themeClasses.textPrimary} mb-6`}>Campaign Details</h2>

                <div className="space-y-5">
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.textPrimary} mb-2`}>
                      Campaign Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Summer Sale 2025"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      className={`w-full px-4 py-2.5 ${themeClasses.input} border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all`}
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.textPrimary} mb-2`}>
                      Message Template <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2 mb-2">
                      {availableTags.map(tag => (
                        <button
                          key={tag.name}
                          onClick={() => insertTag(tag.name)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} transition-colors`}
                          title={tag.desc}
                        >
                          {tag.name}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={messageTemplate}
                      onChange={(e) => setMessageTemplate(e.target.value)}
                      placeholder="Hello {full_name}! We have an exciting offer just for you..."
                      rows={6}
                      className={`w-full px-4 py-2.5 ${themeClasses.input} border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none transition-all`}
                    />
                    <p className={`text-xs ${themeClasses.textSecondary} mt-2`}>
                      {messageTemplate.length} characters
                    </p>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.textPrimary} mb-2`}>
                      Media Attachment <span className="text-gray-400 text-xs">(Optional)</span>
                    </label>
                    {!mediaFile ? (
                      <div>
                        <input
                          type="file"
                          accept="image/*,video/mp4"
                          onChange={handleFileSelect}
                          className="hidden"
                          id="media"
                          disabled={isUploading}
                        />
                        <label
                          htmlFor="media"
                          className={`flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer transition-all ${
                            isDark
                              ? 'border-gray-600 hover:border-gray-500 hover:bg-gray-700/50'
                              : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                          } ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {isUploading ? (
                            <>
                              <Loader className="w-5 h-5 animate-spin text-purple-600" />
                              <span className={`text-sm font-medium ${themeClasses.textPrimary}`}>Uploading...</span>
                            </>
                          ) : (
                            <>
                              <Upload className={`w-5 h-5 ${themeClasses.textSecondary}`} />
                              <span className={`text-sm font-medium ${themeClasses.textPrimary}`}>Click to upload image or video</span>
                              <span className={`text-xs ${themeClasses.textSecondary}`}>(Max 16MB)</span>
                            </>
                          )}
                        </label>
                      </div>
                    ) : (
                      <div className={`flex items-center justify-between p-4 rounded-lg ${isDark ? 'bg-green-900/20 border border-green-800/30' : 'bg-green-50 border border-green-200'}`}>
                        <div className="flex items-center gap-3">
                          <CheckCircle className="w-5 h-5 text-green-600" />
                          <div>
                            <p className={`text-sm font-medium ${themeClasses.textPrimary}`}>{mediaFile.name}</p>
                            <p className={`text-xs ${themeClasses.textSecondary}`}>{(mediaFile.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        </div>
                        <button
                          onClick={() => { setMediaFile(null); setMediaPath(''); }}
                          className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={handleSendCampaign}
                disabled={!campaignName || !messageTemplate || selectedCustomers.length === 0 || !whatsappConnected || isSending || isUploading}
                className={`w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl`}
              >
                {isSending ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    <span>Sending Campaign...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    <span>Send Campaign to {selectedCustomers.length} {selectedCustomers.length === 1 ? 'Customer' : 'Customers'}</span>
                  </>
                )}
              </button>
            </div>

            {/* Recipients Sidebar - 4 columns */}
            <div className="col-span-4">
              <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg sticky top-24`}>
                <div className="p-5 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={`text-sm font-semibold ${themeClasses.textPrimary} uppercase tracking-wider`}>Select Recipients</h3>
                    <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs font-bold rounded-full">
                      {selectedCustomers.length}
                    </span>
                  </div>

                  <div className="relative">
                    <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${themeClasses.textSecondary}`} />
                    <input
                      type="text"
                      placeholder="Search customers..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={`w-full pl-9 pr-3 py-2 text-sm ${themeClasses.input} border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                    />
                  </div>

                  <button
                    onClick={toggleSelectAll}
                    className="mt-3 text-xs font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
                  >
                    {selectedCustomers.length === filteredCustomers.length && filteredCustomers.length > 0 ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                <div className="max-h-[calc(100vh-400px)] overflow-y-auto">
                  {filteredCustomers.length > 0 ? (
                    <div className="p-2">
                      {filteredCustomers.map(customer => (
                        <label
                          key={customer.id}
                          className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all mb-1 ${
                            selectedCustomers.includes(customer.id)
                              ? `${isDark ? 'bg-purple-900/30 border-purple-700' : 'bg-purple-50 border-purple-200'} border`
                              : `${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedCustomers.includes(customer.id)}
                            onChange={() => toggleCustomer(customer.id)}
                            className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                          />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${themeClasses.textPrimary} truncate`}>
                              {customer.first_name} {customer.last_name}
                            </p>
                            <p className={`text-xs ${themeClasses.textSecondary} truncate`}>
                              +{formatPhone(customer.phone)}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center">
                      <Users className={`w-12 h-12 ${themeClasses.textSecondary} mx-auto mb-3 opacity-50`} />
                      <p className={`text-sm ${themeClasses.textSecondary}`}>No customers found</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg overflow-hidden`}>
            {campaigns.length > 0 ? (
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className={isDark ? 'bg-gray-900' : 'bg-gray-50'}>
                  <tr>
                    <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${themeClasses.textSecondary}`}>
                      Campaign Name
                    </th>
                    <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${themeClasses.textSecondary}`}>
                      Created
                    </th>
                    <th className={`px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider ${themeClasses.textSecondary}`}>
                      Sent
                    </th>
                    <th className={`px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider ${themeClasses.textSecondary}`}>
                      Failed
                    </th>
                    <th className={`px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider ${themeClasses.textSecondary}`}>
                      Total
                    </th>
                    <th className={`px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider ${themeClasses.textSecondary}`}>
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                  {campaigns.map(campaign => (
                    <tr
                      key={campaign.id}
                      onClick={() => handleLoadCampaignDetails(campaign)}
                      className={`cursor-pointer ${isDark ? 'hover:bg-gray-750' : 'hover:bg-gray-50'} transition-colors`}
                    >
                      <td className="px-6 py-4">
                        <div className={`text-sm font-semibold ${themeClasses.textPrimary}`}>
                          {campaign.campaign_name}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`text-sm ${themeClasses.textSecondary}`}>
                          {new Date(campaign.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div className={`text-xs ${themeClasses.textSecondary}`}>
                          {new Date(campaign.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center px-3 py-1 text-sm font-bold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 rounded-full">
                          {campaign.sent_count || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center px-3 py-1 text-sm font-bold text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded-full">
                          {campaign.failed_count || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`text-sm font-bold ${themeClasses.textPrimary}`}>
                          {campaign.total_numbers || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex px-3 py-1 text-xs font-bold rounded-full ${
                          campaign.status === 'completed'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                        }`}>
                          {campaign.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-16">
                <TrendingUp className={`w-16 h-16 ${themeClasses.textSecondary} mx-auto mb-4 opacity-50`} />
                <p className={`text-lg font-medium ${themeClasses.textPrimary}`}>No campaigns yet</p>
                <p className={`text-sm ${themeClasses.textSecondary} mt-1`}>Create your first campaign to get started</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-6`}>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.textPrimary} mb-2`}>Select Campaign</label>
                  <select
                    value={selectedCampaign?.id || ''}
                    onChange={(e) => {
                      const campaign = campaigns.find(c => c.id === e.target.value);
                      if (campaign) handleLoadCampaignDetails(campaign);
                    }}
                    className={`w-full px-4 py-2.5 ${themeClasses.input} border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                  >
                    <option value="">Choose a campaign...</option>
                    {campaigns.map(c => (
                      <option key={c.id} value={c.id}>{c.campaign_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.textPrimary} mb-2`}>Filter by Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className={`w-full px-4 py-2.5 ${themeClasses.input} border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                  >
                    <option value="all">All Messages</option>
                    <option value="sent">Sent Only</option>
                    <option value="failed">Failed Only</option>
                  </select>
                </div>
              </div>
            </div>

            {filteredStatuses.length > 0 ? (
              <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg overflow-hidden`}>
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className={isDark ? 'bg-gray-900' : 'bg-gray-50'}>
                    <tr>
                      <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${themeClasses.textSecondary}`}>
                        Customer Name
                      </th>
                      <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${themeClasses.textSecondary}`}>
                        Phone Number
                      </th>
                      <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${themeClasses.textSecondary}`}>
                        Sent At
                      </th>
                      <th className={`px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider ${themeClasses.textSecondary}`}>
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                    {filteredStatuses.map((status, index) => (
                      <tr key={index} className={isDark ? 'hover:bg-gray-750' : 'hover:bg-gray-50'}>
                        <td className="px-6 py-4">
                          <div className={`text-sm font-medium ${themeClasses.textPrimary}`}>
                            {status.first_name} {status.last_name}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className={`text-sm font-mono ${themeClasses.textSecondary}`}>
                            +{status.phone_number}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {status.sent_at ? (
                            <div>
                              <div className={`text-sm ${themeClasses.textSecondary}`}>
                                {new Date(status.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </div>
                              <div className={`text-xs ${themeClasses.textSecondary}`}>
                                {new Date(status.sent_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          ) : (
                            <span className={`text-sm ${themeClasses.textSecondary}`}>—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex px-3 py-1 text-xs font-bold rounded-full ${
                            status.status === 'sent'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          }`}>
                            {status.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg`}>
                <div className="text-center py-16">
                  <Phone className={`w-16 h-16 ${themeClasses.textSecondary} mx-auto mb-4 opacity-50`} />
                  <p className={`text-lg font-medium ${themeClasses.textPrimary}`}>
                    {selectedCampaign ? 'No messages found' : 'Select a campaign to view analytics'}
                  </p>
                  {selectedCampaign && (
                    <p className={`text-sm ${themeClasses.textSecondary} mt-1`}>
                      Try changing the status filter
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Progress Modal */}
      <AnimatePresence>
        {showProgressModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6 max-w-md w-full shadow-2xl`}>
              <div className="flex items-center gap-3 mb-4">
                <Loader className="w-6 h-6 text-purple-600 animate-spin" />
                <h3 className={`text-lg font-semibold ${themeClasses.textPrimary}`}>Sending Campaign</h3>
              </div>

              <div className="mb-4">
                <div className="flex justify-between text-sm font-medium mb-2">
                  <span className={themeClasses.textSecondary}>Progress</span>
                  <span className={themeClasses.textPrimary}>{sendingProgress.current} / {sendingProgress.total}</span>
                </div>
                <div className={`w-full h-2.5 ${isDark ? 'bg-gray-700' : 'bg-gray-200'} rounded-full overflow-hidden`}>
                  <div
                    className="h-full bg-purple-600 transition-all duration-300"
                    style={{ width: `${(sendingProgress.current / sendingProgress.total) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs mt-2">
                  <span className={themeClasses.textSecondary}>
                    {Math.round((sendingProgress.current / sendingProgress.total) * 100)}% Complete
                  </span>
                  <span className={themeClasses.textSecondary}>
                    {sendingProgress.total - sendingProgress.current} remaining
                  </span>
                </div>
              </div>

              {sendingProgress.name && (
                <div className={`p-4 ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'} rounded-lg`}>
                  <p className={`text-xs font-medium ${themeClasses.textSecondary} mb-2`}>Currently sending to:</p>
                  <p className={`text-sm font-semibold ${themeClasses.textPrimary}`}>{sendingProgress.name}</p>
                  <p className={`text-xs font-mono ${themeClasses.textSecondary} mt-1`}>+{sendingProgress.phone}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </AnimatePresence>
      </div>
    </ProtectedPage>
  );
}
