import { Global, Module } from '@nestjs/common';
import { DrivesController } from './drives.controller';
import { DrivesService } from './drives.service';

@Global()
@Module({ controllers: [DrivesController], providers: [DrivesService], exports: [DrivesService] })
export class DrivesModule {}
