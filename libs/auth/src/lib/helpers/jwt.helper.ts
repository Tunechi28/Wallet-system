import { HttpException, HttpStatus } from '@nestjs/common';
import { decode, JwtPayload } from 'jsonwebtoken';

export interface IJwtPayload {
  userId: string;
  email: string;
}

const mapPayloadToJwtPayload = (payload: JwtPayload): IJwtPayload => ({
  email: payload['email'],
  userId: payload['userId'],
});

export const getPayloadFromJwtToken = (
  authorizationValue: string | undefined,
): IJwtPayload => {
  const TOKEN = 1;

  if (!authorizationValue) {
    throw new HttpException(
      'Missing header attribute authorization',
      HttpStatus.BAD_REQUEST,
    );
  }

  const decodedJWT = decode(authorizationValue.split(' ')[TOKEN]);

  if (!decodedJWT || typeof decodedJWT === 'string') {
    throw new HttpException('Invalid JWT token', HttpStatus.BAD_REQUEST);
  }

  return mapPayloadToJwtPayload(decodedJWT);
};
