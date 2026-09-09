/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bench: {
          950: '#15130F',
          900: '#201C16',
          800: '#3D362B',
          700: '#544A3A',
        },
        paper: '#EDE6D8',
        dust: '#96897A',
        brass: {
          DEFAULT: '#CC9346',
          dim: '#5C4726',
        },
        blueprint: {
          DEFAULT: '#7093A8',
          dim: '#2C3D46',
        },
        moss: {
          DEFAULT: '#7E9A6C',
          dim: '#333D28',
        },
        danger: {
          DEFAULT: '#C05B4D',
          dim: '#452622',
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        sm: '3px',
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
      },
    },
  },
  plugins: [],
}
