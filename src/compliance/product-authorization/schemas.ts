import { z } from 'zod';

export const ProductIdentitySchema = z.object({
  reportNumber: z.string().trim().min(1).max(80).optional(),
  itemCode: z.string().trim().min(1).max(80).optional(),
  permitNumber: z.string().trim().min(1).max(80).optional(),
  reviewNumber: z.string().trim().min(1).max(80).optional(),
  productName: z.string().trim().min(1).max(200).optional(),
  companyName: z.string().trim().min(1).max(200).optional(),
});

export const ProductAuthorizationStatusSchema = z.enum([
  'VERIFIED',
  'NOT_FOUND',
  'AMBIGUOUS',
  'UNAVAILABLE',
]);

export const RegulatedProductAuthorizationSchema = z.object({
  category: z
    .enum([
      'HEALTH_FUNCTIONAL_FOOD',
      'PHARMACEUTICAL',
      'MEDICAL_DEVICE',
      'COSMETIC',
    ])
    .optional(),
  authorizationType: z.string().optional(),
  licenseNumber: z.string(),
  companyName: z.string(),
  reportNumber: z.string(),
  productName: z.string(),
  authorizationDate: z.string(),
  productForm: z.string(),
  intakeMethod: z.string(),
  primaryFunctionality: z.string(),
  intakePrecautions: z.string(),
  productType: z.string(),
  functionalIngredients: z.string(),
  productionStatus: z.string(),
  lastUpdatedAt: z.string(),
});

// Backward-compatible alias for the first regulated product pack.
export const HealthFunctionalFoodAuthorizationSchema =
  RegulatedProductAuthorizationSchema;

export const ProductAuthorizationResolutionSchema = z.object({
  status: ProductAuthorizationStatusSchema,
  query: ProductIdentitySchema,
  selectedProduct: RegulatedProductAuthorizationSchema.nullable(),
  candidates: z.array(RegulatedProductAuthorizationSchema),
  sourceName: z.string().min(1),
  sourceUrl: z.url(),
  checkedAt: z.iso.datetime(),
  message: z.string().min(1),
});

export type ProductIdentity = z.infer<typeof ProductIdentitySchema>;
export type ProductAuthorizationResolution = z.infer<
  typeof ProductAuthorizationResolutionSchema
>;
export type HealthFunctionalFoodAuthorization = z.infer<
  typeof HealthFunctionalFoodAuthorizationSchema
>;
export type RegulatedProductAuthorization = z.infer<
  typeof RegulatedProductAuthorizationSchema
>;
