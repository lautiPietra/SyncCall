import { z } from 'zod';
import { objectIdSchema } from './friend.schema';

export const groupNameSchema = z.string().trim().min(1).max(50);
export const groupDescriptionSchema = z.string().trim().max(300).optional();
export const channelNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones');

export const createGroupSchema = z.object({
  name: groupNameSchema,
  memberIds: z.array(objectIdSchema).min(1).max(49),
});

export const updateGroupSchema = z
  .object({
    name: groupNameSchema.optional(),
    description: groupDescriptionSchema,
  })
  .refine((v) => v.name !== undefined || v.description !== undefined, 'Nada para actualizar');

export const groupIdParamsSchema = z.object({ id: objectIdSchema });

export const addGroupMemberSchema = z.object({ userId: objectIdSchema });

export const groupMemberParamsSchema = z.object({ id: objectIdSchema, userId: objectIdSchema });

export const createChannelSchema = z.object({ name: channelNameSchema });

export const channelParamsSchema = z.object({ id: objectIdSchema, channelId: objectIdSchema });

export const inviteIdParamsSchema = z.object({ id: objectIdSchema });

export const respondGroupInviteSchema = z.object({ status: z.enum(['accepted', 'declined']) });

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type AddGroupMemberInput = z.infer<typeof addGroupMemberSchema>;
export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type RespondGroupInviteInput = z.infer<typeof respondGroupInviteSchema>;
