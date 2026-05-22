import { normalizePhoneLike } from './phone';
import type { WorkspaceTeamMember } from './types';

export interface SelectOption {
  value: string;
  label: string;
}

export const SOURCE_OPTIONS = [
  'Website Form',
  'Landing Page',
  'WhatsApp',
  'Meta Ads',
  'Google Ads',
  'Organic Search',
  'Social Media',
  'Referral',
  'Linkedin',
  'YouTube',
  'Website Live Chat',
  'Other',
  'Not Available',
  'Messenger',
  'Instagram',
  'Email',
] as const;

const COUNTRY_DIAL_CODE_DATA = `
DZ|Algeria (+213)
AD|Andorra (+376)
AO|Angola (+244)
AI|Anguilla (+1264)
AG|Antigua & Barbuda (+1268)
AR|Argentina (+54)
AM|Armenia (+374)
AW|Aruba (+297)
AU|Australia (+61)
AT|Austria (+43)
AZ|Azerbaijan (+994)
BS|Bahamas (+1242)
BH|Bahrain (+973)
BD|Bangladesh (+880)
BB|Barbados (+1246)
BY|Belarus (+375)
BE|Belgium (+32)
BZ|Belize (+501)
BJ|Benin (+229)
BM|Bermuda (+1441)
BT|Bhutan (+975)
BO|Bolivia (+591)
BA|Bosnia Herzegovina (+387)
BW|Botswana (+267)
BR|Brazil (+55)
BN|Brunei (+673)
BG|Bulgaria (+359)
BF|Burkina Faso (+226)
BI|Burundi (+257)
KH|Cambodia (+855)
CM|Cameroon (+237)
CA|Canada (+1)
CV|Cape Verde Islands (+238)
KY|Cayman Islands (+1345)
CF|Central African Republic (+236)
CL|Chile (+56)
CN|China (+86)
CO|Colombia (+57)
KM|Comoros (+269)
CG|Congo (+242)
CK|Cook Islands (+682)
CR|Costa Rica (+506)
HR|Croatia (+385)
CU|Cuba (+53)
CY|Cyprus North (+90392)
CY|Cyprus South (+357)
CZ|Czech Republic (+42)
DK|Denmark (+45)
DJ|Djibouti (+253)
DM|Dominica (+1809)
DO|Dominican Republic (+1809)
EC|Ecuador (+593)
EG|Egypt (+20)
SV|El Salvador (+503)
GQ|Equatorial Guinea (+240)
ER|Eritrea (+291)
EE|Estonia (+372)
ET|Ethiopia (+251)
FK|Falkland Islands (+500)
FO|Faroe Islands (+298)
FJ|Fiji (+679)
FI|Finland (+358)
FR|France (+33)
GF|French Guiana (+594)
PF|French Polynesia (+689)
GA|Gabon (+241)
GM|Gambia (+220)
GE|Georgia (+7880)
DE|Germany (+49)
GH|Ghana (+233)
GI|Gibraltar (+350)
GR|Greece (+30)
GL|Greenland (+299)
GD|Grenada (+1473)
GP|Guadeloupe (+590)
GU|Guam (+671)
GT|Guatemala (+502)
GN|Guinea (+224)
GW|Guinea - Bissau (+245)
GY|Guyana (+592)
HT|Haiti (+509)
HN|Honduras (+504)
HK|Hong Kong (+852)
HU|Hungary (+36)
IS|Iceland (+354)
IN|India (+91)
ID|Indonesia (+62)
IR|Iran (+98)
IQ|Iraq (+964)
IE|Ireland (+353)
IL|Israel (+972)
IT|Italy (+39)
JM|Jamaica (+1876)
JP|Japan (+81)
JO|Jordan (+962)
KZ|Kazakhstan (+7)
KE|Kenya (+254)
KI|Kiribati (+686)
KP|Korea North (+850)
KR|Korea South (+82)
KW|Kuwait (+965)
KG|Kyrgyzstan (+996)
LA|Laos (+856)
LV|Latvia (+371)
LB|Lebanon (+961)
LS|Lesotho (+266)
LR|Liberia (+231)
LY|Libya (+218)
LI|Liechtenstein (+417)
LT|Lithuania (+370)
LU|Luxembourg (+352)
MO|Macao (+853)
MK|Macedonia (+389)
MG|Madagascar (+261)
MW|Malawi (+265)
MY|Malaysia (+60)
MV|Maldives (+960)
ML|Mali (+223)
MT|Malta (+356)
MH|Marshall Islands (+692)
MQ|Martinique (+596)
MR|Mauritania (+222)
YT|Mayotte (+269)
MX|Mexico (+52)
FM|Micronesia (+691)
MD|Moldova (+373)
MC|Monaco (+377)
MN|Mongolia (+976)
MS|Montserrat (+1664)
MA|Morocco (+212)
MZ|Mozambique (+258)
MN|Myanmar (+95)
NA|Namibia (+264)
NR|Nauru (+674)
NP|Nepal (+977)
NL|Netherlands (+31)
NC|New Caledonia (+687)
NZ|New Zealand (+64)
NI|Nicaragua (+505)
NE|Niger (+227)
NG|Nigeria (+234)
NU|Niue (+683)
NF|Norfolk Islands (+672)
NP|Northern Marianas (+670)
NO|Norway (+47)
OM|Oman (+968)
PW|Palau (+680)
PA|Panama (+507)
PG|Papua New Guinea (+675)
PY|Paraguay (+595)
PE|Peru (+51)
PH|Philippines (+63)
PL|Poland (+48)
PT|Portugal (+351)
PR|Puerto Rico (+1787)
QA|Qatar (+974)
RE|Reunion (+262)
RO|Romania (+40)
RU|Russia (+7)
RW|Rwanda (+250)
SM|San Marino (+378)
ST|Sao Tome & Principe (+239)
SA|Saudi Arabia (+966)
SN|Senegal (+221)
CS|Serbia (+381)
SC|Seychelles (+248)
SL|Sierra Leone (+232)
SG|Singapore (+65)
SK|Slovak Republic (+421)
SI|Slovenia (+386)
SB|Solomon Islands (+677)
SO|Somalia (+252)
ZA|South Africa (+27)
ES|Spain (+34)
LK|Sri Lanka (+94)
SH|St. Helena (+290)
KN|St. Kitts (+1869)
SC|St. Lucia (+1758)
SD|Sudan (+249)
SR|Suriname (+597)
SZ|Swaziland (+268)
SE|Sweden (+46)
CH|Switzerland (+41)
SI|Syria (+963)
TW|Taiwan (+886)
TJ|Tajikstan (+7)
TH|Thailand (+66)
TG|Togo (+228)
TO|Tonga (+676)
TT|Trinidad & Tobago (+1868)
TN|Tunisia (+216)
TR|Turkey (+90)
TM|Turkmenistan (+7)
TM|Turkmenistan (+993)
TC|Turks & Caicos Islands (+1649)
TV|Tuvalu (+688)
UG|Uganda (+256)
UA|Ukraine (+380)
AE|United Arab Emirates (+971)
UY|Uruguay (+598)
UZ|Uzbekistan (+7)
VU|Vanuatu (+678)
VA|Vatican City (+379)
VE|Venezuela (+58)
VN|Vietnam (+84)
VG|Virgin Islands - British (+1284)
VI|Virgin Islands - US (+1340)
WF|Wallis & Futuna (+681)
YE|Yemen (North)(+969)
YE|Yemen (South)(+967)
ZM|Zambia (+260)
ZW|Zimbabwe (+263)
`;

export interface CountryDialCodeOption {
  id: string;
  countryCode: string;
  dialCode: string;
  label: string;
}

export const COUNTRY_DIAL_CODE_OPTIONS: CountryDialCodeOption[] = COUNTRY_DIAL_CODE_DATA.trim()
  .split('\n')
  .map((line, index) => {
    const [countryCode, label] = line.split('|');
    const dialCodeMatch = label?.match(/\(\+(\d+)\)/);
    return {
      id: `${countryCode}-${dialCodeMatch?.[1] || 'unknown'}-${index}`,
      countryCode,
      dialCode: dialCodeMatch?.[1] || '',
      label,
    };
  });

export const COUNTRY_DIAL_CODE_SELECT_OPTIONS: SelectOption[] = COUNTRY_DIAL_CODE_OPTIONS.map((option) => ({
  value: option.id,
  label: option.label,
}));

const DEFAULT_COUNTRY_ISO = 'IN';
const DEFAULT_COUNTRY_DIAL_CODE_OPTION_ID =
  COUNTRY_DIAL_CODE_OPTIONS.find((option) => option.countryCode === DEFAULT_COUNTRY_ISO)?.id ||
  COUNTRY_DIAL_CODE_OPTIONS[0]?.id ||
  '';

const COUNTRY_DIAL_CODE_OPTIONS_BY_LENGTH = [...COUNTRY_DIAL_CODE_OPTIONS].sort(
  (left, right) => right.dialCode.length - left.dialCode.length,
);

const COUNTRY_DIAL_CODE_OPTIONS_BY_ID = new Map(
  COUNTRY_DIAL_CODE_OPTIONS.map((option) => [option.id, option] as const),
);

export function getDefaultCountryDialCodeOptionId(preferredCountryCode?: string | null) {
  const normalizedCountryCode = preferredCountryCode?.trim().toUpperCase();

  if (normalizedCountryCode) {
    const exactMatch = COUNTRY_DIAL_CODE_OPTIONS.find((option) => option.countryCode === normalizedCountryCode);

    if (exactMatch) {
      return exactMatch.id;
    }
  }

  return DEFAULT_COUNTRY_DIAL_CODE_OPTION_ID;
}

export function getCountryDialCodeOptionById(optionId: string) {
  return COUNTRY_DIAL_CODE_OPTIONS_BY_ID.get(optionId) || null;
}

export function splitPhoneForForm(value: unknown, preferredCountryCode?: string | null) {
  const defaultOptionId = getDefaultCountryDialCodeOptionId(preferredCountryCode);
  const fallbackOption = getCountryDialCodeOptionById(defaultOptionId);
  const trimmedValue = typeof value === 'string' ? value.trim() : '';
  const digits = normalizePhoneLike(trimmedValue);

  if (!trimmedValue) {
    return {
      countryOptionId: defaultOptionId,
      contactNumber: '',
    };
  }

  if (!digits) {
    return {
      countryOptionId: defaultOptionId,
      contactNumber: trimmedValue,
    };
  }

  const matchedOption =
    COUNTRY_DIAL_CODE_OPTIONS_BY_LENGTH.find(
      (option) => option.dialCode && digits.startsWith(option.dialCode) && digits.length > option.dialCode.length,
    ) || fallbackOption;

  return {
    countryOptionId: matchedOption?.id || defaultOptionId,
    contactNumber: matchedOption?.dialCode ? digits.slice(matchedOption.dialCode.length) : digits,
  };
}

export function buildPhoneFromForm(countryOptionId: string, contactNumber: string) {
  const trimmedNumber = contactNumber.trim();

  if (!trimmedNumber) {
    return '';
  }

  const digits = normalizePhoneLike(trimmedNumber);

  if (!digits) {
    return trimmedNumber;
  }

  const dialCode =
    getCountryDialCodeOptionById(countryOptionId)?.dialCode ||
    getCountryDialCodeOptionById(DEFAULT_COUNTRY_DIAL_CODE_OPTION_ID)?.dialCode ||
    '91';

  return `+${dialCode}${digits}`;
}

function getOwnerOptionValue(member: WorkspaceTeamMember) {
  return (member.fullName || member.email).trim();
}

export function buildOwnerOptions(teamMembers: WorkspaceTeamMember[], fallbackOwners: string[]) {
  const optionMap = new Map<string, SelectOption>([['', { value: '', label: 'Unassigned' }]]);

  teamMembers
    .filter((member) => member.status === 'active' || member.isOwner)
    .sort((left, right) => {
      if (left.isOwner !== right.isOwner) {
        return left.isOwner ? -1 : 1;
      }

      return getOwnerOptionValue(left).localeCompare(getOwnerOptionValue(right), undefined, {
        sensitivity: 'base',
      });
    })
    .forEach((member) => {
      const value = getOwnerOptionValue(member);

      if (!value || optionMap.has(value)) {
        return;
      }

      optionMap.set(value, {
        value,
        label: member.isOwner ? `${value} (You)` : value,
      });
    });

  fallbackOwners.forEach((ownerName) => {
    const value = ownerName.trim();

    if (!value || optionMap.has(value)) {
      return;
    }

    optionMap.set(value, {
      value,
      label: value,
    });
  });

  return Array.from(optionMap.values());
}

export function buildSourceOptions(fallbackSources: string[]) {
  const optionMap = new Map<string, SelectOption>();

  SOURCE_OPTIONS.forEach((source) => {
    optionMap.set(source, {
      value: source,
      label: source,
    });
  });

  fallbackSources.forEach((sourceName) => {
    const value = sourceName.trim();

    if (!value || optionMap.has(value)) {
      return;
    }

    optionMap.set(value, {
      value,
      label: value,
    });
  });

  return Array.from(optionMap.values());
}
