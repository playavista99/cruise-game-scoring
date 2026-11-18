/* Cruise Game Scoring App — configuration.
 *
 * The app is fully usable with these left blank: games, templates and
 * history live on this device only.
 *
 * To enable the OPTIONAL staff account (cloud sync of custom templates
 * only), create a Supabase project (see supabase/schema.sql and the
 * README), then paste the project URL and the public anon key here.
 * The same project also serves feedback and the live player view
 * (v2.3): when staff share a game, a first-names-only snapshot is
 * published for players — never cabins, never full names of
 * individuals, never team member names. Games otherwise never leave
 * the device.
 */
window.APP_CONFIG = {
  SUPABASE_URL: 'https://zwvtupimuzlvghwikvqr.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_-TLl7C0z8K6mx5K0TNawrw_FQoevBWv',
  /* Optional: paste a WhatsApp group invite link (https://chat.whatsapp.com/…)
     to show a "Join the WhatsApp group" entry in the ☰ menu.
     Leave empty and the entry stays hidden. */
  WHATSAPP_GROUP_URL: 'https://chat.whatsapp.com/GfK5zuhx2vbIYaFtvooLkz'
};
