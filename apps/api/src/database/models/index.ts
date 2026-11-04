import { AdminLog, AdminLogSplunk, AdminMessage, ParamApp } from './admin.models.js';
import { Formulaire } from './formulaire.model.js';
import { Planning } from './planning.model.js';
import { RefUser } from './ref-user.model.js';

export { AdminLog, AdminLogSplunk, AdminMessage, ParamApp, Formulaire, Planning, RefUser };

export const ALL_MODELS = [RefUser, Planning, Formulaire, ParamApp, AdminMessage, AdminLog, AdminLogSplunk];
