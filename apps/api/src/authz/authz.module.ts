import { Global, Module } from '@nestjs/common';
import { AuthorizationService } from './authz.service';

@Global()
@Module({ providers: [AuthorizationService], exports: [AuthorizationService] })
export class AuthzModule {}
