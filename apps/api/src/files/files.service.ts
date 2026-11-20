import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model, Types } from 'mongoose';
import { StoredFile, StoredFileDocument } from '../database/schemas/file.schema';
import { Role } from '../common/constants';
import { AuthUser } from '../common/decorators';
import { AuthorizationService } from '../authz/authz.service';
import { AuditService } from '../audit/audit.service';
import { detectFileType, MAX_FILE_BYTES, MAX_FILES_PER_STUDENT, safeFileName } from './file-type';

export interface FileMeta {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class FilesService {
  constructor(
    @InjectModel(StoredFile.name) private readonly files: Model<StoredFileDocument>,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  private meta(f: { _id: any; originalName: string; mimeType: string; size: number }): FileMeta {
    return { id: String(f._id), name: f.originalName, mimeType: f.mimeType, size: f.size };
  }

  /** Stores a certificate scan for the signed-in student (PDF, PNG or JPEG, at most 2 MB). */
  async storeCertificate(user: AuthUser, file: { buffer: Buffer; originalname: string; size: number } | undefined, ip?: string): Promise<FileMeta> {
    if (user.role !== Role.Student) throw new ForbiddenException('Only students upload certificates');
    if (!file?.buffer?.length) throw new BadRequestException('Choose a file to upload (field name "file")');
    if (file.buffer.length > MAX_FILE_BYTES) throw new PayloadTooLargeException('The file is larger than 2 MB');
    const type = detectFileType(file.buffer);
    if (!type) throw new BadRequestException('Only PDF, PNG or JPEG files are accepted');
    const count = await this.files.countDocuments({ owner: user.id });
    if (count >= MAX_FILES_PER_STUDENT) throw new ConflictException(`You can store at most ${MAX_FILES_PER_STUDENT} files. Remove an unused upload first.`);

    const doc = await this.files.create({
      owner: user.id,
      purpose: 'certificate',
      originalName: safeFileName(file.originalname, type.ext),
      mimeType: type.mime,
      size: file.buffer.length,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
      attachedTo: null,
      data: file.buffer,
    });
    await this.audit.log('file.upload', user, 'StoredFile', String(doc._id), { size: doc.size, mimeType: doc.mimeType }, ip);
    return this.meta(doc);
  }

  /**
   * Checks a file can be attached to new evidence by `studentId`: it exists, is theirs, is a certificate
   * and is not already used. Returns its metadata. (The atomic claim happens in `attach`.)
   */
  async assertAttachable(studentId: string, fileId: string): Promise<FileMeta> {
    if (!Types.ObjectId.isValid(fileId)) throw new BadRequestException('Unknown uploaded file');
    const f = await this.files.findOne({ _id: fileId, owner: studentId, purpose: 'certificate' }).lean();
    if (!f) throw new BadRequestException('Unknown uploaded file');
    if (f.attachedTo) throw new ConflictException('This file is already attached to another evidence item');
    return this.meta(f);
  }

  /** Atomically claims the file for an evidence item; fails if someone else claimed it first. */
  async attach(studentId: string, fileId: string, evidenceId: string): Promise<boolean> {
    const res = await this.files.updateOne({ _id: fileId, owner: studentId, attachedTo: null }, { $set: { attachedTo: new Types.ObjectId(evidenceId) } });
    return res.matchedCount === 1;
  }

  async deleteForEvidence(evidenceId: string): Promise<void> {
    await this.files.deleteMany({ attachedTo: new Types.ObjectId(evidenceId) });
  }

  /** Student removes an upload that is not used by any evidence item. */
  async removeUnattached(user: AuthUser, id: string) {
    if (user.role !== Role.Student) throw new ForbiddenException('Only students remove their uploads');
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('File not found');
    const f = await this.files.findOne({ _id: id, owner: user.id }).select('attachedTo').lean();
    if (!f) throw new NotFoundException('File not found');
    if (f.attachedTo) throw new ConflictException('This file belongs to an evidence item. Withdraw the evidence to remove it.');
    await this.files.deleteOne({ _id: id, owner: user.id, attachedTo: null });
    return { ok: true };
  }

  /** The student's own uploads that no evidence item uses yet. */
  async listUnattached(user: AuthUser): Promise<FileMeta[]> {
    const rows = await this.files.find({ owner: user.id, attachedTo: null }).sort({ createdAt: -1 }).limit(MAX_FILES_PER_STUDENT).lean();
    return rows.map((r) => this.meta(r));
  }

  /** File contents for the owner, their mentor, the placement cell or an admin (same rule as the student's evidence). */
  async readForDownload(user: AuthUser, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('File not found');
    // Hydrated (not lean) so `data` is a real Buffer rather than a BSON Binary wrapper.
    const f = await this.files.findById(id).select('+data');
    if (!f) throw new NotFoundException('File not found');
    await this.authz.assertCanAccessStudent(user, String(f.owner));
    return { originalName: f.originalName, mimeType: f.mimeType, data: Buffer.from(f.data) };
  }
}
