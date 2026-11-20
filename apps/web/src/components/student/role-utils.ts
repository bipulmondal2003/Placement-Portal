export const bandVariant = (b: string) => (b === 'role_ready' ? 'verified' : b === 'almost_ready' ? 'primary' : b === 'building' ? 'pending' : 'gap') as 'verified' | 'primary' | 'pending' | 'gap';
