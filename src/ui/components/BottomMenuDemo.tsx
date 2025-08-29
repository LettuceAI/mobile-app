import { useState } from "react";
import { Plus, User, Brain, Settings, Heart, Star, Coffee } from "lucide-react";
import { 
  BottomMenu, 
  MenuButton, 
  MenuSection, 
  MenuDivider,
  MenuButtonGroup 
} from "./BottomMenu";

export function BottomMenuDemo() {
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showTopMenu, setShowTopMenu] = useState(false);

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-bold">Bottom Menu Demo</h2>
      
      <div className="space-y-3">
        <button
          className="w-full p-3 bg-blue-500 text-white rounded-lg"
          onClick={() => setShowCreateMenu(true)}
        >
          Show Create Menu (Basic)
        </button>
        
        <button
          className="w-full p-3 bg-purple-500 text-white rounded-lg"
          onClick={() => setShowActionsMenu(true)}
        >
          Show Actions Menu (Advanced)
        </button>
        
        <button
          className="w-full p-3 bg-green-500 text-white rounded-lg"
          onClick={() => setShowTopMenu(true)}
        >
          Show Top Menu (No Exit Icon)
        </button>
      </div>

      <BottomMenu 
        isOpen={showCreateMenu} 
        onClose={() => setShowCreateMenu(false)}
        title="Create New"
        includeExitIcon={true}
        location="bottom"
      >
        <MenuSection>
          <MenuButton
            icon={User}
            title="Create Character"
            description="Design a unique AI character"
            color="from-blue-500 to-blue-600"
            onClick={() => {
              console.log("Create Character");
              setShowCreateMenu(false);
            }}
          />
          
          <MenuButton
            icon={Brain}
            title="Create Persona"
            description="Define a roleplay persona"
            color="from-purple-500 to-purple-600"
            onClick={() => {
              console.log("Create Persona");
              setShowCreateMenu(false);
            }}
          />
        </MenuSection>
      </BottomMenu>

      <BottomMenu 
        isOpen={showActionsMenu} 
        onClose={() => setShowActionsMenu(false)}
        title="Actions"
        includeExitIcon={true}
        location="bottom"
      >
        <MenuSection label="Create">
          <MenuButton
            icon={User}
            title="New Character"
            color="from-blue-500 to-blue-600"
            onClick={() => console.log("New Character")}
          />
          
          <MenuButton
            icon={Brain}
            title="New Persona"
            color="from-purple-500 to-purple-600"
            onClick={() => console.log("New Persona")}
          />
        </MenuSection>

        <MenuDivider />

        <MenuSection label="Favorites">
          <MenuButton
            icon={Heart}
            title="Favorite Characters"
            description="Manage your favorite AI characters"
            color="from-red-500 to-red-600"
            onClick={() => console.log("Favorites")}
          />
          
          <MenuButton
            icon={Star}
            title="Starred Conversations"
            description="View your best conversations"
            color="from-yellow-500 to-yellow-600"
            onClick={() => console.log("Starred")}
          />
        </MenuSection>

        <MenuDivider label="Other" />

        <MenuButtonGroup>
          <MenuButton
            icon={Settings}
            title="Settings"
            color="from-gray-500 to-gray-600"
            onClick={() => console.log("Settings")}
          />
          
          <MenuButton
            icon={Coffee}
            title="Buy Me Coffee"
            description="Support the developer"
            color="from-amber-500 to-amber-600"
            onClick={() => console.log("Coffee")}
          />
        </MenuButtonGroup>
      </BottomMenu>

      <BottomMenu 
        isOpen={showTopMenu} 
        onClose={() => setShowTopMenu(false)}
        title="Quick Actions"
        includeExitIcon={false}
        location="top"
      >
        <MenuSection>
          <MenuButton
            icon={Plus}
            title="Quick Add"
            description="Add something quickly"
            color="from-green-500 to-green-600"
            onClick={() => {
              console.log("Quick Add");
              setShowTopMenu(false);
            }}
          />
          
          <MenuButton
            icon={Settings}
            title="Quick Settings"
            description="Access common settings"
            color="from-indigo-500 to-indigo-600"
            onClick={() => {
              console.log("Quick Settings");
              setShowTopMenu(false);
            }}
          />
        </MenuSection>
      </BottomMenu>
    </div>
  );
}
