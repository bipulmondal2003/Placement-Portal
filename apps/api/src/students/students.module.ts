import { Global, Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Global()
@Module({ controllers: [StudentsController], providers: [StudentsService], exports: [StudentsService] })
export class StudentsModule {}
