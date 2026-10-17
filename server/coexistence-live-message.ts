/** A live delivery may arrive after the same wamid was imported. Claim that
 * delivery once and restore its reply-window eligibility without moving it. */
export async function claimLiveWhatsAppMessage(args: {
  supabase: { from(table: string): any }; userId: string; messageId: string;
}): Promise<'new' | 'duplicate' | 'promoted'> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const found = await args.supabase.from('conversation_messages').select('id,direction,raw')
      .eq('user_id', args.userId).eq('wa_message_id', args.messageId).maybeSingle();
    if (found.error) throw found.error;
    if (!found.data) return 'new';
    const row = found.data;
    const raw = row.raw || {};
    const marker = raw.connektly_coexistence;
    if (row.direction !== 'inbound' || marker?.historical !== true) return 'duplicate';
    const saved = await args.supabase.from('conversation_messages').update({
      raw: { ...raw, connektly_coexistence: {
        ...marker, historical: false, affectsCustomerServiceWindow: true, liveDeliveryObserved: true,
      } },
    }).eq('user_id', args.userId).eq('id', row.id).eq('raw', JSON.stringify(raw)).select('id').maybeSingle();
    if (saved.error) throw saved.error;
    if (saved.data) return 'promoted';
  }
  throw new Error('The WhatsApp message changed repeatedly. Retry its live delivery.');
}
