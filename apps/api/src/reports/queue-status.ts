import { Injectable } from '@nestjs/common';
import { JobsService } from '../queues/jobs.service';

/** Thin indirection so report controllers don't depend on the whole JobsService surface. */
@Injectable()
export class QueuesStatusProxy {
  constructor(private readonly jobs: JobsService) {}
  status() {
    return this.jobs.queueStatus();
  }
}
