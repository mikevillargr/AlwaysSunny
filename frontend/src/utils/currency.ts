/**
 * Comprehensive currency code → symbol mapping.
 * Single source of truth used by Settings, History, SessionStats, and any other display.
 */

export const CURRENCIES: { code: string; symbol: string; name: string }[] = [
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'ARS', symbol: 'AR$', name: 'Argentine Peso' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka' },
  { code: 'BGN', symbol: 'лв', name: 'Bulgarian Lev' },
  { code: 'BHD', symbol: 'BD', name: 'Bahraini Dinar' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'CLP', symbol: 'CL$', name: 'Chilean Peso' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'COP', symbol: 'CO$', name: 'Colombian Peso' },
  { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  { code: 'HRK', symbol: 'kn', name: 'Croatian Kuna' },
  { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  { code: 'ILS', symbol: '₪', name: 'Israeli Shekel' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'ISK', symbol: 'kr', name: 'Icelandic Króna' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar' },
  { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan Rupee' },
  { code: 'MMK', symbol: 'K', name: 'Myanmar Kyat' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { code: 'OMR', symbol: 'ر.ع.', name: 'Omani Rial' },
  { code: 'PEN', symbol: 'S/', name: 'Peruvian Sol' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty' },
  { code: 'QAR', symbol: 'QR', name: 'Qatari Riyal' },
  { code: 'RON', symbol: 'lei', name: 'Romanian Leu' },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  { code: 'TWD', symbol: 'NT$', name: 'Taiwan Dollar' },
  { code: 'UAH', symbol: '₴', name: 'Ukrainian Hryvnia' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
]

/** Map of currency code → symbol for quick lookup */
export const CURRENCY_SYMBOLS: Record<string, string> = Object.fromEntries(
  CURRENCIES.map((c) => [c.code, c.symbol])
)

/** Get the symbol for a currency code, falling back to the code itself */
export function getCurrencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] || code + ' '
}
