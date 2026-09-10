import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

describe('Selection Mutation (patch_selection_batch)', () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  let galleryId: string;
  let selectionId: string;
  let photo1: string;
  let photo2: string;
  let photo3: string;
  let photoMissing: string;

  beforeAll(async () => {
    // Setup test data
    galleryId = randomUUID();
    selectionId = randomUUID();
    photo1 = randomUUID();
    photo2 = randomUUID();
    photo3 = randomUUID();
    photoMissing = randomUUID();

    const galleryRes = await supabase.from('galleries').insert({
      id: galleryId,
      branch_id: (await supabase.from('branches').select('id').limit(1).single()).data!.id,
      customer_id: (await supabase.from('customers').select('id').limit(1).single()).data!.id,
      drive_folder_id: 'test_folder_' + randomUUID(),
      drive_folder_url: 'http://test',
      title: 'Test Gallery',
      status: 'ready',
      included_quota: 2,
      max_selection: null,
      allow_extra: false
    });
    if (galleryRes.error) throw galleryRes.error;

    const linkRes = await supabase.from('share_links').insert({
      id: randomUUID(),
      gallery_id: galleryId,
      token_hash: randomUUID(),
      token_prefix: '123456',
      role: 'owner'
    }).select('id').single();
    if (linkRes.error) throw linkRes.error;

    const selRes = await supabase.from('selections').insert({
      id: selectionId,
      gallery_id: galleryId,
      share_link_id: linkRes.data.id,
      display_name: 'Test'
    });
    if (selRes.error) throw selRes.error;

    const photoRes = await supabase.from('photos').insert([
      { id: photo1, gallery_id: galleryId, drive_file_id: randomUUID(), file_name: '1.jpg', mime_type: 'image/jpeg', status: 'active', width: 100, height: 100 },
      { id: photo2, gallery_id: galleryId, drive_file_id: randomUUID(), file_name: '2.jpg', mime_type: 'image/jpeg', status: 'active', width: 100, height: 100 },
      { id: photo3, gallery_id: galleryId, drive_file_id: randomUUID(), file_name: '3.jpg', mime_type: 'image/jpeg', status: 'active', width: 100, height: 100 },
      { id: photoMissing, gallery_id: galleryId, drive_file_id: randomUUID(), file_name: 'miss.jpg', mime_type: 'image/jpeg', status: 'missing', width: 100, height: 100 }
    ]);
    if (photoRes.error) throw photoRes.error;
  });

  it('1. op chỉ có ghi chú, ảnh chưa chọn -> KHÔNG tự chọn ảnh', async () => {
    const { data, error } = await supabase.rpc('patch_selection_batch', {
      p_client_op_id: randomUUID(),
      p_selection_id: selectionId,
      p_gallery_id: galleryId,
      p_role: 'owner',
      p_ops: [{ photoId: photo1, retouchNote: 'Xóa mụn' }],
      p_max_selection: null,
      p_allow_extra: false,
      p_included_quota: 2,
      p_extra_price: 50000,
      p_actor_label: 'Test',
      p_ip: null,
      p_user_agent: null
    });
    
    expect(error).toBeNull();
    // It should reject this photo
    expect(data.rejected.length).toBe(1);
    expect(data.rejected[0].code).toBe('INVALID_INPUT');
    expect(data.selectedCount).toBe(0);
  });

  it('2. op chỉ có ghi chú, ảnh đang favorite -> vẫn favorite', async () => {
    // Mark photo2 as favorite first
    await supabase.from('selection_items').insert({
      selection_id: selectionId,
      photo_id: photo2,
      gallery_id: galleryId,
      mark: 'favorite'
    });

    const { data, error } = await supabase.rpc('patch_selection_batch', {
      p_client_op_id: randomUUID(),
      p_selection_id: selectionId,
      p_gallery_id: galleryId,
      p_role: 'owner',
      p_ops: [{ photoId: photo2, retouchNote: 'Xóa mụn' }],
      p_max_selection: null,
      p_allow_extra: false,
      p_included_quota: 2,
      p_extra_price: 50000,
      p_actor_label: 'Test',
      p_ip: null,
      p_user_agent: null
    });

    expect(error).toBeNull();
    expect(data.rejected.length).toBe(0);
    expect(data.selectedCount).toBe(0);
    expect(data.favoriteCount).toBe(1);

    const { data: item } = await supabase.from('selection_items').select('mark, retouch_note').eq('photo_id', photo2).single();
    expect(item!.mark).toBe('favorite');
    expect(item!.retouch_note).toBe('Xóa mụn');
  });

  it('3. allow_extra=false, max_selection=null, chọn quá included_quota -> QUOTA_EXCEEDED', async () => {
    // quota is 2. Select 3 photos.
    const { error } = await supabase.rpc('patch_selection_batch', {
      p_client_op_id: randomUUID(),
      p_selection_id: selectionId,
      p_gallery_id: galleryId,
      p_role: 'owner',
      p_ops: [
        { photoId: photo1, mark: 'selected' },
        { photoId: photo2, mark: 'selected' },
        { photoId: photo3, mark: 'selected' }
      ],
      p_max_selection: null,
      p_allow_extra: false,
      p_included_quota: 2,
      p_extra_price: 50000,
      p_actor_label: 'Test',
      p_ip: null,
      p_user_agent: null
    });

    expect(error).not.toBeNull();
    expect(error?.message).toBe('QUOTA_EXCEEDED');
  });

  it('4. album in_retouch -> GALLERY_LOCKED', async () => {
    // Lock gallery
    await supabase.from('galleries').update({ status: 'in_retouch' }).eq('id', galleryId);

    const { error } = await supabase.rpc('patch_selection_batch', {
      p_client_op_id: randomUUID(),
      p_selection_id: selectionId,
      p_gallery_id: galleryId,
      p_role: 'owner',
      p_ops: [{ photoId: photo1, mark: 'selected' }],
      p_max_selection: null,
      p_allow_extra: false,
      p_included_quota: 2,
      p_extra_price: 50000,
      p_actor_label: 'Test',
      p_ip: null,
      p_user_agent: null
    });

    expect(error).not.toBeNull();
    expect(error?.message).toBe('GALLERY_LOCKED');

    // Restore gallery
    await supabase.from('galleries').update({ status: 'ready' }).eq('id', galleryId);
  });

  it('5. clientOpId trùng của selection khác -> CONFLICT', async () => {
    const clientId = randomUUID();
    // Use it for this selection
    await supabase.rpc('patch_selection_batch', {
      p_client_op_id: clientId,
      p_selection_id: selectionId,
      p_gallery_id: galleryId,
      p_role: 'owner',
      p_ops: [],
      p_max_selection: null,
      p_allow_extra: false,
      p_included_quota: 2,
      p_extra_price: 50000,
      p_actor_label: 'Test',
      p_ip: null,
      p_user_agent: null
    });

    // Use it for ANOTHER selection
    const { error } = await supabase.rpc('patch_selection_batch', {
      p_client_op_id: clientId,
      p_selection_id: randomUUID(),
      p_gallery_id: galleryId,
      p_role: 'owner',
      p_ops: [],
      p_max_selection: null,
      p_allow_extra: false,
      p_included_quota: 2,
      p_extra_price: 50000,
      p_actor_label: 'Test',
      p_ip: null,
      p_user_agent: null
    });

    expect(error).not.toBeNull();
    expect(error?.message).toBe('CONFLICT');
  });

  it('6. đang 20/20, đổi ảnh (bỏ 1 chọn 1) -> THÀNH CÔNG', async () => {
    // Select photo1, photo3 (quota is 2)
    await supabase.rpc('patch_selection_batch', {
      p_client_op_id: randomUUID(),
      p_selection_id: selectionId,
      p_gallery_id: galleryId,
      p_role: 'owner',
      p_ops: [
        { photoId: photo1, mark: 'selected' },
        { photoId: photo3, mark: 'selected' }
      ],
      p_max_selection: null,
      p_allow_extra: false,
      p_included_quota: 2,
      p_extra_price: 50000,
      p_actor_label: 'Test',
      p_ip: null,
      p_user_agent: null
    });

    // Now change photo1 -> null, photo2 -> selected. Net change is 0.
    const { error, data } = await supabase.rpc('patch_selection_batch', {
      p_client_op_id: randomUUID(),
      p_selection_id: selectionId,
      p_gallery_id: galleryId,
      p_role: 'owner',
      p_ops: [
        { photoId: photo1, mark: null },
        { photoId: photo2, mark: 'selected' }
      ],
      p_max_selection: null,
      p_allow_extra: false,
      p_included_quota: 2,
      p_extra_price: 50000,
      p_actor_label: 'Test',
      p_ip: null,
      p_user_agent: null
    });

    expect(error).toBeNull();
    expect(data.selectedCount).toBe(2);
  });

  it('7. ảnh missing lẫn trong lô -> vào rejected[], phần còn lại vẫn áp dụng', async () => {
    // Reset selection
    await supabase.from('selection_items').delete().eq('selection_id', selectionId);

    const { data, error } = await supabase.rpc('patch_selection_batch', {
      p_client_op_id: randomUUID(),
      p_selection_id: selectionId,
      p_gallery_id: galleryId,
      p_role: 'owner',
      p_ops: [
        { photoId: photo1, mark: 'selected' },
        { photoId: photoMissing, mark: 'selected' }
      ],
      p_max_selection: null,
      p_allow_extra: false,
      p_included_quota: 2,
      p_extra_price: 50000,
      p_actor_label: 'Test',
      p_ip: null,
      p_user_agent: null
    });

    expect(error).toBeNull();
    expect(data.selectedCount).toBe(1);
    expect(data.rejected.length).toBe(1);
    expect(data.rejected[0].photoId).toBe(photoMissing);
  });

  // Bài test dựng album thật trong bb-dev. Không dọn thì verify:db đỏ vì
  // photo_count lệch, và người ta sẽ quen với việc bỏ qua dòng đỏ đó.
  afterAll(async () => {
    if (galleryId) await supabase.from('galleries').delete().eq('id', galleryId);
  });
});
