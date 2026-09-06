// Shared country list for the "Country" dropdown on the Ticket Desk and
// Customer Directory (real backend and the backend-free local app both use
// this so the option list — and the "Oman" default — never drift apart).
export const DEFAULT_COUNTRY = "Oman";

export const COUNTRIES = [
  "Oman", "United Arab Emirates", "Saudi Arabia", "Qatar", "Bahrain", "Kuwait",
  "Afghanistan", "Albania", "Algeria", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaijan", "Bangladesh", "Belarus", "Belgium", "Bhutan", "Bosnia and Herzegovina",
  "Brazil", "Brunei", "Bulgaria", "Cambodia", "Cameroon", "Canada", "Chad", "Chile",
  "China", "Colombia", "Croatia", "Cyprus", "Czech Republic", "Denmark", "Djibouti",
  "Egypt", "Eritrea", "Estonia", "Ethiopia", "Fiji", "Finland", "France", "Georgia",
  "Germany", "Ghana", "Greece", "Hungary", "Iceland", "India", "Indonesia", "Iran",
  "Iraq", "Ireland", "Israel", "Italy", "Japan", "Jordan", "Kazakhstan", "Kenya",
  "Kosovo", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Libya", "Lithuania",
  "Luxembourg", "Malaysia", "Maldives", "Malta", "Mauritania", "Mauritius", "Mexico",
  "Moldova", "Mongolia", "Montenegro", "Morocco", "Myanmar", "Nepal", "Netherlands",
  "New Zealand", "Nigeria", "North Macedonia", "Norway", "Pakistan", "Palestine",
  "Philippines", "Poland", "Portugal", "Romania", "Russia", "Rwanda", "Senegal",
  "Serbia", "Seychelles", "Singapore", "Slovakia", "Slovenia", "Somalia",
  "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan",
  "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand",
  "Tunisia", "Turkey", "Turkmenistan", "Uganda", "Ukraine", "United Kingdom",
  "United States", "Uzbekistan", "Vietnam", "Yemen", "Zambia", "Zimbabwe", "Other",
];

// International calling codes for the phone auto-prefix — keyed to match
// COUNTRIES exactly. "Other" has no code (nothing to auto-fill).
export const COUNTRY_DIAL_CODES: Record<string, string> = {
  Oman: "+968", "United Arab Emirates": "+971", "Saudi Arabia": "+966", Qatar: "+974", Bahrain: "+973", Kuwait: "+965",
  Afghanistan: "+93", Albania: "+355", Algeria: "+213", Argentina: "+54", Armenia: "+374", Australia: "+61", Austria: "+43",
  Azerbaijan: "+994", Bangladesh: "+880", Belarus: "+375", Belgium: "+32", Bhutan: "+975", "Bosnia and Herzegovina": "+387",
  Brazil: "+55", Brunei: "+673", Bulgaria: "+359", Cambodia: "+855", Cameroon: "+237", Canada: "+1", Chad: "+235", Chile: "+56",
  China: "+86", Colombia: "+57", Croatia: "+385", Cyprus: "+357", "Czech Republic": "+420", Denmark: "+45", Djibouti: "+253",
  Egypt: "+20", Eritrea: "+291", Estonia: "+372", Ethiopia: "+251", Fiji: "+679", Finland: "+358", France: "+33", Georgia: "+995",
  Germany: "+49", Ghana: "+233", Greece: "+30", Hungary: "+36", Iceland: "+354", India: "+91", Indonesia: "+62", Iran: "+98",
  Iraq: "+964", Ireland: "+353", Israel: "+972", Italy: "+39", Japan: "+81", Jordan: "+962", Kazakhstan: "+7", Kenya: "+254",
  Kosovo: "+383", Kyrgyzstan: "+996", Laos: "+856", Latvia: "+371", Lebanon: "+961", Libya: "+218", Lithuania: "+370",
  Luxembourg: "+352", Malaysia: "+60", Maldives: "+960", Malta: "+356", Mauritania: "+222", Mauritius: "+230", Mexico: "+52",
  Moldova: "+373", Mongolia: "+976", Montenegro: "+382", Morocco: "+212", Myanmar: "+95", Nepal: "+977", Netherlands: "+31",
  "New Zealand": "+64", Nigeria: "+234", "North Macedonia": "+389", Norway: "+47", Pakistan: "+92", Palestine: "+970",
  Philippines: "+63", Poland: "+48", Portugal: "+351", Romania: "+40", Russia: "+7", Rwanda: "+250", Senegal: "+221",
  Serbia: "+381", Seychelles: "+248", Singapore: "+65", Slovakia: "+421", Slovenia: "+386", Somalia: "+252",
  "South Africa": "+27", "South Korea": "+82", "South Sudan": "+211", Spain: "+34", "Sri Lanka": "+94", Sudan: "+249",
  Sweden: "+46", Switzerland: "+41", Syria: "+963", Taiwan: "+886", Tajikistan: "+992", Tanzania: "+255", Thailand: "+66",
  Tunisia: "+216", Turkey: "+90", Turkmenistan: "+993", Uganda: "+256", Ukraine: "+380", "United Kingdom": "+44",
  "United States": "+1", Uzbekistan: "+998", Vietnam: "+84", Yemen: "+967", Zambia: "+260", Zimbabwe: "+263",
};

// Auto-fills the phone field with the selected country's dial code, without
// ever clobbering something the user already typed: it only acts when the
// field is empty, or still holds exactly the previous country's auto-filled
// prefix untouched (so switching Country before typing a number swaps the
// prefix instead of leaving a stale one in front of it).
export function applyCountryDialCode(currentPhone: string, previousCountry: string, nextCountry: string): string {
  const nextCode = COUNTRY_DIAL_CODES[nextCountry];
  if (!nextCode) return currentPhone;
  const previousPrefix = COUNTRY_DIAL_CODES[previousCountry] ? `${COUNTRY_DIAL_CODES[previousCountry]} ` : "";
  if (!currentPhone.trim() || currentPhone === previousPrefix) return `${nextCode} `;
  return currentPhone;
}
