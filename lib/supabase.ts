import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ygopojsrevygharjoopw.supabase.co/rest/v1/.supabase.co'
const supabaseAnonKey = 'sb_publishable_aOvtiPv06SV8Qt9Z3QHHfw_b0r-kvPl'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)