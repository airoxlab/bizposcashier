/** @type {import('tailwindcss').Config} */
module.exports = {
  // Enable dark mode using class strategy
  darkMode: 'class',
  
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  
  theme: {
    extend: {
      // Custom gradients for your theme manager
      backgroundImage: {
        'theme-gradient-default': 'linear-gradient(135deg, #e0e7ff 0%, #f3e8ff 50%, #fce7f3 100%)',
        'theme-gradient-ocean': 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #2563eb 100%)',
        'theme-gradient-sunset': 'linear-gradient(135deg, #fb923c 0%, #ef4444 50%, #ec4899 100%)',
        'theme-gradient-forest': 'linear-gradient(135deg, #4ade80 0%, #22c55e 50%, #059669 100%)',
        'theme-gradient-purple': 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 50%, #4f46e5 100%)',
        'theme-gradient-midnight': 'linear-gradient(135deg, #111827 0%, #581c87 50%, #1e40af 100%)',
        'theme-gradient-gradient1': 'linear-gradient(135deg, #f9a8d4 0%, #c084fc 50%, #818cf8 100%)',
        'theme-gradient-gradient2': 'linear-gradient(135deg, #fef08a 0%, #bbf7d0 50%, #86efac 100%)',
        'theme-gradient-gradient3': 'linear-gradient(135deg, #fecaca 0%, #fca5a5 50%, #fde68a 100%)',
      },
      
      // Custom colors that work well with dark mode
      colors: {
        // Primary brand colors
        primary: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        
        // Custom dark mode grays
        dark: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
        }
      },
      
      // Custom shadows for better dark mode support
      boxShadow: {
        'dark-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)',
        'dark-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
        'dark-2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
      },
      
      // Animation improvements
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  
  plugins: [
    // Add any plugins you need
    // require('@tailwindcss/forms'),
    // require('@tailwindcss/typography'),
  ],
}