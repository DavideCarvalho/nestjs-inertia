import 'reflect-metadata';
import { Body, Controller, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEmail, IsString, MinLength, ValidateNested } from 'class-validator';

class AddressDto {
  @IsString()
  city!: string;
}

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto;
}

@Controller('account')
export class AccountFormsController {
  @Post('/register')
  register(@Body() _dto: RegisterDto) {
    return { ok: true };
  }
}
