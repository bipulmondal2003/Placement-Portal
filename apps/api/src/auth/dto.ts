import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsInt, IsOptional, IsString, Matches, MaxLength, Min, Max, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{10,128}$/;
const PASSWORD_MSG = 'Password must be 10-128 characters and include at least one letter and one number';

export class RegisterDto {
  @ApiProperty() @IsEmail() @MaxLength(160) email: string;
  @ApiProperty() @IsString() @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) password: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) department?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) graduationYear?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) rollNumber?: string;
}

export class LoginDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(128) password: string;
}

export class ChangePasswordDto {
  @ApiProperty() @IsString() currentPassword: string;
  @ApiProperty() @IsString() @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) newPassword: string;
}
