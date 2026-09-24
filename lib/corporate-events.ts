import {z} from 'zod';
import {uuid,isoDate,nonnegativeAmount,notes} from './api-validation';
export const corporateEventSchema=z.object({id:uuid,record_id:uuid,target_id:uuid.nullable(),revision:z.number().int().positive(),target_revision:z.number().int().positive().nullable(),kind:z.enum(['dividend','split','security_transfer']),date:isoDate,notes,gross:nonnegativeAmount.default(0),withholding:nonnegativeAmount.default(0),reinvest_amount:nonnegativeAmount.default(0),quantity:nonnegativeAmount.max(1e12).default(0),numerator:nonnegativeAmount.default(0),denominator:nonnegativeAmount.default(0)}).superRefine((p,ctx)=>{
 const valid=p.kind==='dividend'?!!p.target_id&&p.gross>0&&p.withholding<=p.gross&&p.reinvest_amount<=p.gross-p.withholding&&(p.reinvest_amount>0)===(p.quantity>0)&&p.numerator===0&&p.denominator===0:p.gross===0&&p.withholding===0&&p.reinvest_amount===0&&(p.kind==='split'?!p.target_id&&p.numerator>0&&p.denominator>0&&p.quantity===0:!!p.target_id&&p.target_id!==p.record_id&&p.quantity>0&&p.numerator===0&&p.denominator===0);
 if(!valid)ctx.addIssue({code:'custom',message:'Check the investment event fields.'});
});
export type CorporateEvent=z.infer<typeof corporateEventSchema>;
