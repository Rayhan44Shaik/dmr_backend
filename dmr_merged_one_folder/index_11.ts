    export interface UserProfile {
    id: number;
    name: string;
    email: string;
    role: string;
    department: string;
    mobile: string;
    employeeId: string;
    dateJoined: string;
    username: string;
    profileImage?: string;
    }

    export interface SystemUser {
    id: number;
    name: string;
    username: string;
    department: string;
    role: string;
    status: "Active" | "Inactive";
    lastLogin: string;
    }

    export interface Permission {
    module: string;
    view: boolean;
    add: boolean;
    edit: boolean;
    delete: boolean;
    }