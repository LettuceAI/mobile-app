import { Brain, User } from "lucide-react";
import { BottomMenu, MenuButton, MenuSection } from "./BottomMenu";
import { useNavigate } from "react-router-dom";

export function CreateMenu({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const navigate = useNavigate();
    return (
        <BottomMenu
            isOpen={isOpen}
            onClose={onClose}
            title="Create New"
            includeExitIcon={false}
            location="bottom"
        >
            <MenuSection>
                <MenuButton
                    icon={User}
                    title="Create Character"
                    description="Design a unique AI character with personality traits"
                    color="from-blue-500 to-blue-600"
                    onClick={() => {
                        onClose();
                        navigate("/create/character");
                    }}
                />

                <MenuButton
                    icon={Brain}
                    title="Create Persona"
                    description="Define a reusable writing style or personality"
                    color="from-purple-500 to-purple-600"
                    onClick={() => {
                        onClose();
                        navigate("/create/persona");
                    }}
                />
            </MenuSection>
        </BottomMenu>
    );
}
