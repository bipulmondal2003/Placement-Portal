import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/**
 * An uploaded document (currently: certificate scans). Stored inside MongoDB so the app needs no extra
 * infrastructure and works on hosts with ephemeral disks. The binary is excluded from every query unless
 * explicitly selected, so listing evidence never loads file contents.
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class StoredFile {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true })
  owner: Types.ObjectId;

  @Prop({ required: true, enum: ['certificate'] })
  purpose: 'certificate';

  @Prop({ required: true, trim: true, maxlength: 150 })
  originalName: string;

  /** Detected from the file's own bytes, never trusted from the client. */
  @Prop({ required: true, enum: ['application/pdf', 'image/png', 'image/jpeg'] })
  mimeType: string;

  @Prop({ required: true, min: 1 })
  size: number;

  @Prop({ required: true })
  sha256: string;

  /** Evidence item this file belongs to; null until the student submits the evidence. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'EvidenceItem', default: null, index: true })
  attachedTo?: Types.ObjectId | null;

  @Prop({ type: Buffer, required: true, select: false })
  data: Buffer;
}
export type StoredFileDocument = HydratedDocument<StoredFile>;
export const StoredFileSchema = SchemaFactory.createForClass(StoredFile);
StoredFileSchema.index({ owner: 1, createdAt: -1 });
